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
    ".validate": "newData.hasChildren(['autor', 'url', 'ts']) && newData.child('autor').isString() && newData.child('url').isString() && newData.child('url').val().beginsWith('https://firebasestorage.googleapis.com/') && newData.child('url').val().length <= 1500 && newData.child('ts').isNumber()"
  }
}
```

Observações:

- O `.write` fica no nó `midia` (e não só nos filhos) porque o botão **🧹 Limpar** apaga o nó inteiro de uma vez.
- `midia/{id}` guarda `{ autor, url, ts, nome, usadaEmFicha? }`; o arquivo da imagem fica no **Firebase Storage**
  (`mesas/{mesaId}/midia/...`), cujas regras atuais já aceitam imagens de até 5 MB. As imagens são reduzidas no navegador
  (lado maior 1280 px, WebP) antes do envio, para gastar pouco armazenamento e banda.
- O botão **🧹 Limpar** (só Mestre/Co-Mestre) apaga todas as imagens do chat e os arquivos no Storage. Imagens que já viraram
  avatar de um NPC mantêm o arquivo (senão o avatar sumiria), mas saem do chat.
- Qualquer usuário autenticado pode escrever no nó, como nos chats: a restrição "só o Mestre limpa" é da interface.
