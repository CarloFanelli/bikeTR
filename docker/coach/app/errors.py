"""Errori mostrati all'utente: un codice per il programma, un messaggio in italiano per la persona."""


class CoachError(Exception):
    def __init__(self, status: int, code: str, message: str):
        super().__init__(message)
        self.status, self.code, self.message = status, code, message
