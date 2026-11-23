// ==========================================
// 📖 ACESSO RÁPIDO ÀS FICHAS PELO MAPA (Mestre): lista de quem está na cena (personagens e tokens da Gaveta) e de
// todas as fichas da mesa (NPCs e jogadores), com busca, pra abrir a ficha ou "Atuar como" num clique.
// Puro: não toca em Firebase nem na tela.
// ==========================================
import { ehNpc } from './tipoPersonagem.js';
import { getPosicaoEntidade } from './alcance.js';

const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const porNome = (a, b) => String(a.rotulo).localeCompare(String(b.rotulo), 'pt-BR', { numeric: true });

const naCenaDe = (ficha, cenaId) => {
    const p = getPosicaoEntidade(ficha, cenaId);
    return !!(p && p.x !== undefined && (p.cenaId || 'default') === (cenaId || 'default'));
};

// → { naCena, npcs, jogadores }, cada item { chave, rotulo, nomeFicha, npc, atorValor, dummieId }.
//   - nomeFicha: a ficha que abre ("Rappa" para o token "Rappa #2"); null se o token não tem ficha de origem.
//   - atorValor: valor de core/atorCombate.js (d:<id> | n:<nome>) pra "Atuar como", ou null quando não dá (jogador).
export function listarFichasParaAcesso({ personagens, dummies, cenaId, busca = '' } = {}) {
    const termo = norm(busca).trim();
    const passa = (...textos) => !termo || textos.some(t => norm(t).includes(termo));
    const naCena = [];
    const npcs = [];
    const jogadores = [];

    Object.entries(dummies || {}).forEach(([id, d]) => {
        if (!d || (d.cenaId || 'default') !== (cenaId || 'default')) return;
        const nomeFicha = d.fichaOrigem && personagens && personagens[d.fichaOrigem] ? d.fichaOrigem : null;
        if (!passa(d.nome, d.fichaOrigem)) return;
        naCena.push({ chave: `d:${id}`, rotulo: `👹 ${d.nome || id}`, nomeFicha, npc: true, atorValor: nomeFicha ? `d:${id}` : null, dummieId: id });
    });

    Object.entries(personagens || {}).forEach(([nome, ficha]) => {
        if (!ficha || typeof ficha !== 'object') return;
        const npc = ehNpc(ficha);
        if (!passa(nome)) return;
        const item = { chave: `n:${nome}`, rotulo: `${npc ? '👹' : '🧑'} ${nome}`, nomeFicha: nome, npc, atorValor: null, dummieId: null };
        if (naCenaDe(ficha, cenaId)) {
            naCena.push({ ...item, atorValor: npc ? `n:${nome}` : null });
        } else {
            (npc ? npcs : jogadores).push(item);
        }
    });

    return { naCena: naCena.sort(porNome), npcs: npcs.sort(porNome), jogadores: jogadores.sort(porNome) };
}

// Ficha que o botão 📖 do resumo do token abre: a do personagem, ou a ficha de origem do token; null se não há.
export function nomeFichaDoToken(inspecao, personagens) {
    if (!inspecao) return null;
    if (inspecao.isDummie) {
        const origem = inspecao.ficha && inspecao.ficha.fichaOrigem;
        return origem && personagens && personagens[origem] ? origem : null;
    }
    return personagens && personagens[inspecao.id] ? inspecao.id : null;
}

// Valor de "Atuar como" do token inspecionado (d:<id> | n:<nome>) — só NPCs; jogadores não (null).
export function atorValorDoToken(inspecao, personagens) {
    if (!inspecao) return null;
    if (inspecao.isDummie) return nomeFichaDoToken(inspecao, personagens) ? `d:${inspecao.id}` : null;
    const ficha = personagens && personagens[inspecao.id];
    return ficha && ehNpc(ficha) ? `n:${inspecao.id}` : null;
}
