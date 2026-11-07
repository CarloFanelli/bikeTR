#!/usr/bin/env node
// build_papers_index.mjs
// Cerca paper su PubMed per query (esearch), scarica abstract (efetch),
// genera embeddings via Ollama nomic-embed-text, salva papers_index.json nella
// cartella del progetto, da qualunque cartella lo si lanci.
//
// Usa search queries (non PMID fissi) per evitare di indovinare ID errati.
// Esecuzione, dalla cartella del progetto: node tools/build_papers_index.mjs

import fs from 'node:fs/promises';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = 'nomic-embed-text';
const EUTILS = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
const INDEX_FILE = new URL('../papers_index.json', import.meta.url);

// Ogni voce: query PubMed precisa + filtro autore/anno per disambiguare.
// Lo script fa esearch, prende il primo hit, efetch dell'abstract.
const SEARCHES = [
  { tag: 'Seiler-Kjerland-2006', query: 'Seiler Kjerland quantifying training intensity distribution elite endurance athletes' },
  { tag: 'Seiler-2010-bestpractice', query: 'Seiler 2010 best practice training intensity duration distribution endurance' },
  { tag: 'Ronnestad-2014-block', query: 'Ronnestad Hansen Ellefsen block periodization high-intensity aerobic intervals cyclists' },
  { tag: 'Ronnestad-2020-short', query: 'Ronnestad short intervals superior training adaptations cyclists' },
  { tag: 'Ronnestad-2010-strength', query: 'Ronnestad Hansen Raastad strength training improves 5-min all-out 185 min cycling' },
  { tag: 'Vikmoen-2016-strength', query: 'Vikmoen heavy strength training improves cycling performance well-trained' },
  { tag: 'Mujika-2018-periodization', query: 'Mujika Halson Burke integrated multifactorial periodization optimal performance' },
  { tag: 'Laursen-Jenkins-2002-HIIT', query: 'Laursen Jenkins scientific basis high-intensity interval training' },
  { tag: 'Buchheit-Laursen-2013-HIIT-I', query: 'Buchheit Laursen high-intensity interval training solutions programming puzzle Part I cardiopulmonary' },
  { tag: 'Buchheit-Laursen-2013-HIIT-II', query: 'Buchheit Laursen high-intensity interval training solutions programming puzzle Part II anaerobic' },
  { tag: 'Stoggl-Sperlich-2014-polarized', query: 'Stoggl Sperlich polarized training endurance athletes' },
  { tag: 'Almquist-2020-block', query: 'Almquist block periodization endurance training high-intensity well-trained' },
  { tag: 'Casado-2019-marathon', query: 'Casado world-class marathon training intensity distribution' },
  { tag: 'Stepto-1999-intervals', query: 'Stepto Hawley effects different interval training cycling performance' },
  { tag: 'Seiler-2013-4x8', query: 'Seiler Joranger 4x8 interval training cyclists VO2max FTP' },
  { tag: 'Allen-Coggan-NP', query: 'normalized power training stress score cycling Coggan' },
];

async function pubmedSearch(query) {
  const url = `${EUTILS}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=1&retmode=json`;
  const res = await fetch(url, { headers: { 'User-Agent': 'BikeTR-Coach/1.0' } });
  if (!res.ok) throw new Error(`esearch HTTP ${res.status}`);
  const j = await res.json();
  const ids = j?.esearchresult?.idlist || [];
  if (!ids.length) throw new Error('nessun hit');
  return ids[0];
}

async function pubmedFetchXML(pmid) {
  const url = `${EUTILS}/efetch.fcgi?db=pubmed&id=${pmid}&rettype=abstract&retmode=xml`;
  const res = await fetch(url, { headers: { 'User-Agent': 'BikeTR-Coach/1.0' } });
  if (!res.ok) throw new Error(`efetch HTTP ${res.status}`);
  return await res.text();
}

function stripTags(s) {
  return (s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/\s+/g, ' ')
    .trim();
}

function parseXML(xml) {
  const m1 = (re) => (xml.match(re) || [, ''])[1];
  const title = stripTags(m1(/<ArticleTitle[^>]*>([\s\S]*?)<\/ArticleTitle>/));
  const journal = stripTags(m1(/<Journal>[\s\S]*?<Title>([\s\S]*?)<\/Title>/));
  const year = m1(/<PubDate>[\s\S]*?<Year>(\d{4})<\/Year>/) || m1(/<MedlineDate>(\d{4})/) || '';
  const abstractParts = [...xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/g)]
    .map((m, i, all) => {
      const labelMatch = m[0].match(/Label="([^"]+)"/);
      const txt = stripTags(m[1]);
      return labelMatch && all.length > 1 ? `${labelMatch[1]}: ${txt}` : txt;
    });
  const abstract = abstractParts.join(' ').trim();
  const lastNames = [...xml.matchAll(/<LastName>([^<]+)<\/LastName>/g)].map(m => stripTags(m[1]));
  let authors = '';
  if (lastNames.length === 1) authors = lastNames[0];
  else if (lastNames.length === 2) authors = `${lastNames[0]} & ${lastNames[1]}`;
  else if (lastNames.length > 2) authors = `${lastNames[0]} et al.`;
  return { title, journal, year, abstract, authors };
}

async function ollamaEmbed(text) {
  const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) throw new Error(`Ollama embed HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.embedding)) throw new Error('embedding mancante');
  return data.embedding;
}

async function main() {
  console.log(`Costruisco indice paper (${SEARCHES.length} query)...`);
  console.log(`Ollama: ${OLLAMA_URL} · embed: ${EMBED_MODEL}\n`);

  const papers = [];
  const seen = new Set();

  for (const { tag, query } of SEARCHES) {
    try {
      const pmid = await pubmedSearch(query);
      if (seen.has(pmid)) {
        console.warn(`⚠️  ${tag}: PMID ${pmid} già indicizzato — skip`);
        await new Promise(r => setTimeout(r, 350));
        continue;
      }
      seen.add(pmid);
      const xml = await pubmedFetchXML(pmid);
      const meta = parseXML(xml);
      if (!meta.abstract || meta.abstract.length < 100) {
        console.warn(`⚠️  ${tag} (PMID ${pmid}): abstract corto (${meta.abstract.length}ch) — skip`);
        await new Promise(r => setTimeout(r, 350));
        continue;
      }
      const embedInput = `${meta.title}\n\n${meta.abstract}`;
      const embedding = await ollamaEmbed(embedInput);
      papers.push({
        pmid,
        title: meta.title,
        authors: meta.authors,
        year: meta.year,
        journal: meta.journal,
        abstract: meta.abstract,
        embedding,
      });
      console.log(`✓ [${tag}] PMID ${pmid} (${meta.year}) ${meta.authors}`);
      console.log(`    ${meta.title.slice(0, 90)}${meta.title.length > 90 ? '…' : ''}`);
      await new Promise(r => setTimeout(r, 350));
    } catch (e) {
      console.error(`✗ [${tag}]: ${e.message}`);
      await new Promise(r => setTimeout(r, 350));
    }
  }

  const out = {
    model: EMBED_MODEL,
    builtAt: new Date().toISOString(),
    count: papers.length,
    embeddingDim: papers[0]?.embedding?.length || 0,
    papers,
  };
  await fs.writeFile(INDEX_FILE, JSON.stringify(out));
  const sizeKb = ((await fs.stat(INDEX_FILE)).size / 1024).toFixed(1);
  console.log(`\n✅ Salvato papers_index.json — ${papers.length}/${SEARCHES.length} paper · ${out.embeddingDim}d · ${sizeKb} KB`);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
