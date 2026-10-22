import { lazy } from 'react';

// React.lazy que se recupera: tenta carregar o pedaço de novo (rede instável) e, se a versão do app mudou e o pedaço antigo
// não existe mais, recarrega a página UMA vez (trava em sessionStorage pra não entrar em laço).
const CHAVE_RECARGA = 'rpgChunkRecarregou';

export function importarComRetry(importador, tentativas = 2, espera = 600) {
    return importador().catch((erro) => {
        if (tentativas > 0) {
            return new Promise(r => setTimeout(r, espera)).then(() => importarComRetry(importador, tentativas - 1, espera));
        }
        let jaRecarregou = false;
        try { jaRecarregou = sessionStorage.getItem(CHAVE_RECARGA) === '1'; } catch (e) { /* sem sessionStorage */ }
        if (!jaRecarregou && typeof window !== 'undefined') {
            try { sessionStorage.setItem(CHAVE_RECARGA, '1'); } catch (e) { /* sem sessionStorage */ }
            window.location.reload();
            return new Promise(() => {});
        }
        throw erro;
    });
}

export default function lazyComRetry(importador) {
    return lazy(() => importarComRetry(importador));
}
