// Rótulo curto de um alvo de Habilidade de Redução de Dano ("Todo dano", "Elemento Yin", "Fogo"), sem emojis:
// usado nas listas do Livro de Combate do Mapa. (A ficha mostra a versão com ícones, em FichaSubComponents.jsx.)
import { POLARIDADES } from './polaridade.js';
import { ELEMENTOS_SISTEMA, chaveElemento } from './elementos.js';
import { getAlvosReducao } from './reducaoDano.js';

export function rotuloAlvoReducao(alvo) {
    const a = String(alvo || '');
    if (a === 'todos') return 'Todo dano';
    if (a.startsWith('pol:')) {
        const pol = POLARIDADES[a.slice(4)];
        return pol ? `Elemento ${pol.nome}` : a;
    }
    const el = ELEMENTOS_SISTEMA.find(e => chaveElemento(e.id) === chaveElemento(a));
    return el ? el.nome : a;
}

// "Fogo, Água" / "Todo dano"
export function descreverAlvosReducao(r) {
    return getAlvosReducao(r).map(rotuloAlvoReducao).join(', ');
}
