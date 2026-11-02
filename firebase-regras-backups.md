# Regras do Firebase para os backups da ficha

O app guarda uma cópia diária de cada ficha (e uma cópia "antes de importar") em:

- `mesas/<mesa>/backups/<personagem>/<AAAA-MM-DD>` (a ficha)
- `mesas/<mesa>/backupsIndice/<personagem>/<AAAA-MM-DD>` (lista pequena, usada para listar e podar)

Se as regras do Realtime Database do projeto bloqueiam caminhos novos dentro de `mesas/<mesa>`, a cópia diária falha em silêncio
(a aba Perfil mostra "Não consegui ler os backups da nuvem"). Libere os dois caminhos igual ao que já vale para `personagens`, por exemplo:

```json
"mesas": {
  "$mesa": {
    "backups": { ".read": true, ".write": true },
    "backupsIndice": { ".read": true, ".write": true }
  }
}
```

As cópias guardam no máximo 20 por personagem (as mais antigas são apagadas) e deixam de fora imagens embutidas (`data:`) acima de 300 mil caracteres.
Apagar o personagem NÃO apaga os backups dele.
