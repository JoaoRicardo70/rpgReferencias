# Regras do Realtime Database para o chat de mídia (Sala da Party)

Como nos chats, o `database.rules.json` do repositório não é publicado pelo CI: valem as regras do
**Firebase Console → Realtime Database → Regras**. O chat de mídia grava em um nó novo dentro de `mesas/$mesaId`.
Se as regras da mesa só liberam nós conhecidos, o envio falha com `permission_denied` (a interface mostra esse motivo).
Adicione, **dentro do bloco `"$mesaId"` que já existe** em `"mesas"` (sem apagar nada do que já está lá):

```json
"midia": {
  ".read": "auth != null",
  ".write": "auth != null",
  "$imagem": {
    ".validate": "newData.hasChildren(['autor', 'url', 'ts']) && newData.child('autor').isString() && newData.child('url').isString() && ((newData.child('url').val().matches(/^data:image\\/(png|jpeg|jpg|webp|gif);base64,/) && newData.child('url').val().length <= 300000) || (newData.child('url').val().beginsWith('https://firebasestorage.googleapis.com/') && newData.child('url').val().length <= 1500)) && newData.child('ts').isNumber()"
  }
}
```

Observações:

- O `.write` fica no nó `midia` (e não só nos filhos) porque o botão **🧹 Limpar** apaga o nó inteiro de uma vez.
- `midia/{id}` guarda `{ autor, url, ts, nome, usadaEmFicha? }`. A imagem **não usa o Firebase Storage** (o upload falha em produção):
  ela é reduzida no navegador (lado maior 960 px, WebP) e gravada como data URL em `url`, no mesmo padrão dos avatares das fichas.
  Por isso a regra de `url` aceita `data:image/...` de até 300000 caracteres (a regra antiga, que exigia só `https://firebasestorage...`, precisa ser trocada; a nova ainda aceita os dois formatos e barra SVG).
- O botão **🧹 Limpar** (só Mestre/Co-Mestre) apaga todas as imagens do chat (libera espaço no banco). O avatar de um NPC criado a partir de
  uma imagem é uma cópia na ficha, então continua existindo.
- Qualquer usuário autenticado pode escrever no nó, como nos chats: a restrição "só o Mestre limpa" é da interface.
