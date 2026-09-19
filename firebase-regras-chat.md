# Regras do Realtime Database para os chats

O `database.rules.json` deste repositório está desatualizado e **não é publicado pelo CI** (o deploy é só do
Hosting). As regras valem apenas as que estão no **Firebase Console → Realtime Database → Regras**.

Os chats gravam em três nós novos dentro de `mesas/$mesaId`. Se as regras da mesa só liberam nós conhecidos,
as mensagens falham com `permission_denied` (a interface mostra esse motivo). Adicione, **dentro do bloco
`"$mesaId"` que já existe** em `"mesas"` (sem apagar nada do que já está lá):

```json
"chatsMembros": {
  "$nome": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
},
"chatsMensagens": {
  "$chatId": {
    ".read": "auth != null",
    "$msg": {
      ".write": "auth != null",
      ".validate": "newData.hasChildren(['autor', 'texto', 'ts']) && newData.child('autor').isString() && newData.child('texto').isString() && newData.child('texto').val().length <= 500 && newData.child('ts').isNumber()"
    }
  }
},
"chatsLidos": {
  "$nome": {
    ".read": "auth != null",
    ".write": "auth != null"
  }
}
```

Observações:

- `chatsMembros/{nome}` recebe a cópia do cadastro de cada conversa privada/grupo; quem cria a conversa grava
  no índice dos outros membros, por isso a escrita precisa valer para qualquer usuário autenticado.
- A privacidade dos chats privados e grupos é **só da interface**: as regras acima permitem que qualquer
  usuário autenticado leia `chatsMensagens`. Para privacidade real seria preciso mapear contas (uid) a
  personagens nas regras.
- `ts` é gravado com `serverTimestamp()` do Firebase (número em milissegundos).
