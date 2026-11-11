// Un colore del tema per nome ("series-green", "muted"), nel tema attivo: letto dentro un
// computed, cambiando tema il valore si ricalcola.
import { useTheme } from 'vuetify';

export function useThemeColor(): (name: string) => string {
  const theme = useTheme();
  return name => String(theme.current.value.colors[name]);
}
