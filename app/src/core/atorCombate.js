// ==========================================
// 🎭 ATOR DE COMBATE — quem está AGINDO no Mapa. Normalmente é o próprio jogador logado; o MESTRE
// pode "atuar como" qualquer NPC da cena (ficha própria, com poderes, formas, status) e trocar de
// NPC num clique, pra conduzir vários combatentes. store.atorCombate = { nome, dummieId? }:
//   - nome     → nome da ficha do NPC em `personagens` (de onde saem poderes/armas/energia);
//   - dummieId → quando o NPC está no mapa como token da Gaveta (Dummie com fichaOrigem), a posição
//                e o nome exibido vêm do token (ex.: "Goblin #2"), a ficha é a do "Goblin".
// ==========================================
import { ehNpc } from './tipoPersonagem.js';
import { getPosicaoEntidade } from './alcance.js';

// Valor serializado usado nos selects: 'd:<dummieId>' (token da Gaveta) ou 'n:<nome>' (ficha NPC).
export function valorDoAtor(ator) {
    if (!ator) return '';
    return ator.dummieId ? `d:${ator.dummieId}` : `n:${ator.nome}`;
}

export function atorDeValor(valor, dummies) {
    if (!valor) return null;
    if (valor.startsWith('d:')) {
        const id = valor.slice(2);
        const d = dummies && dummies[id];
        return d && d.fichaOrigem ? { nome: d.fichaOrigem, dummieId: id } : null;
    }
    if (valor.startsWith('n:')) return { nome: valor.slice(2) };
    return null;
}

// Atores que o Mestre pode escolher na cena: tokens da Gaveta com ficha NPC + NPCs com ficha posicionados.
export function listarAtoresDaCena({ personagens, dummies, cenaId }) {
    const lista = [];
    Object.entries(dummies || {}).forEach(([id, d]) => {
        if (!d || !d.fichaOrigem || !(personagens && personagens[d.fichaOrigem])) return;
        if ((d.cenaId || 'default') !== (cenaId || 'default')) return;
        lista.push({ valor: `d:${id}`, rotulo: `👹 ${d.nome}`, nome: d.fichaOrigem, dummieId: id });
    });
    Object.entries(personagens || {}).forEach(([nome, f]) => {
        if (!ehNpc(f)) return;
        if (!getPosicaoEntidade(f, cenaId) || getPosicaoEntidade(f, cenaId).cenaId !== (cenaId || 'default')) return;
        lista.push({ valor: `n:${nome}`, rotulo: `👹 ${nome}`, nome });
    });
    return lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }));
}

// Resolve o ator ativo. Só vale pro Mestre e se a ficha ainda existir; senão null (= age como si mesmo).
// → { nomeFicha, nomeExibido, ficha, dummieId, posicao } | null
export function resolverAtorCombate(atorCombate, { personagens, dummies, isMestre, cenaId } = {}) {
    if (!isMestre || !atorCombate || !atorCombate.nome) return null;
    const ficha = personagens ? personagens[atorCombate.nome] : null;
    if (!ficha) return null;
    const dummie = atorCombate.dummieId && dummies ? dummies[atorCombate.dummieId] : null;
    if (atorCombate.dummieId && !dummie) return null;
    // Token em OUTRA cena (a que o Mestre está vendo): o ator deixa de valer.
    if (dummie && cenaId && (dummie.cenaId || 'default') !== cenaId) return null;
    const posicao = dummie ? getPosicaoEntidade(dummie, cenaId) : getPosicaoEntidade(ficha, cenaId);
    return {
        nomeFicha: atorCombate.nome,
        nomeExibido: dummie ? dummie.nome : atorCombate.nome,
        ficha,
        dummieId: atorCombate.dummieId || null,
        posicao,
    };
}
