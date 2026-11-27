// ==========================================
// 🎭 ATOR DE COMBATE — quem está AGINDO no Mapa. Normalmente é o próprio jogador logado; o MESTRE
// pode "atuar como" qualquer NPC da cena (ficha própria, com poderes, formas, status) e trocar de
// NPC num clique, pra conduzir vários combatentes. store.atorCombate = { nome }:
//   - nome → nome da ficha do NPC em `personagens` (de onde saem poderes/armas/energia, posição e nome exibido).
// ==========================================
import { ehNpc } from './tipoPersonagem.js';
import { getPosicaoEntidade } from './alcance.js';

// Valor serializado usado nos selects: 'n:<nome>' (ficha NPC).
export function valorDoAtor(ator) {
    if (!ator) return '';
    return `n:${ator.nome}`;
}

export function atorDeValor(valor) {
    if (!valor) return null;
    if (valor.startsWith('n:')) return { nome: valor.slice(2) };
    return null;
}

// Atores que o Mestre pode escolher na cena: NPCs com ficha posicionados.
export function listarAtoresDaCena({ personagens, cenaId }) {
    const lista = [];
    Object.entries(personagens || {}).forEach(([nome, f]) => {
        if (!ehNpc(f)) return;
        if (!getPosicaoEntidade(f, cenaId) || getPosicaoEntidade(f, cenaId).cenaId !== (cenaId || 'default')) return;
        lista.push({ valor: `n:${nome}`, rotulo: `👹 ${nome}`, nome });
    });
    return lista.sort((a, b) => a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }));
}

// Resolve o ator ativo. Só vale pro Mestre e se a ficha ainda existir; senão null (= age como si mesmo).
// → { nomeFicha, nomeExibido, ficha, posicao } | null
export function resolverAtorCombate(atorCombate, { personagens, isMestre, cenaId } = {}) {
    if (!isMestre || !atorCombate || !atorCombate.nome) return null;
    const ficha = personagens ? personagens[atorCombate.nome] : null;
    if (!ficha) return null;
    const posicao = getPosicaoEntidade(ficha, cenaId);
    return {
        nomeFicha: atorCombate.nome,
        nomeExibido: atorCombate.nome,
        ficha,
        posicao,
    };
}
