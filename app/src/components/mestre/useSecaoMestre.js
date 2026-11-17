import { useEffect, useRef } from 'react';
import useStore from '../../stores/useStore';

// 🧭 Sub-abas do Painel do Mestre (a barra SubAbasMestre) e as seções que os links de outras telas sabem alcançar (pedirSecaoMestre(id) no store).
export const SUBABAS_MESTRE = [
    { id: 'combate', icone: '⚔️', rotulo: 'Combate' },
    { id: 'racas', icone: '🧬', rotulo: 'Raças' },
    { id: 'entidades', icone: '👥', rotulo: 'Entidades' },
    { id: 'forja', icone: '💀', rotulo: 'Forja' },
];
export const SUBABA_PADRAO_MESTRE = 'combate';

// `dom` é o id estável do elemento da seção na página. `sub` = sub-aba onde a seção mora (null = fica acima das sub-abas, sempre visível).
export const SECOES_MESTRE = [
    { id: 'pedidos', dom: 'mestre-sec-pedidos', rotulo: '🔔 Pedidos', sub: null },
    { id: 'turnos', dom: 'mestre-sec-turnos', rotulo: '⚔️ Turnos', sub: 'combate' },
    { id: 'equipes', dom: 'mestre-sec-equipes', rotulo: '🛡️ Equipes e Relações', sub: 'combate' },
    { id: 'segurar', dom: 'mestre-sec-segurar', rotulo: '⏳ Segurar Ação', sub: 'combate' },
    { id: 'racas', dom: 'mestre-sec-racas', rotulo: '🧬 Raças', sub: 'racas' },
    { id: 'biblioteca', dom: 'mestre-sec-biblioteca', rotulo: '📚 Biblioteca de Habilidades de Raça', sub: 'racas' },
    { id: 'jogadores', dom: 'mestre-sec-jogadores', rotulo: '👥 Jogadores', sub: 'entidades' },
    { id: 'forja', dom: 'mestre-sec-forja', rotulo: '💀 Forja de Entidades', sub: 'forja' },
];

export const domDaSecaoMestre = (id) => {
    const s = SECOES_MESTRE.find(x => x.id === id);
    return s ? s.dom : null;
};

export const subAbaDaSecaoMestre = (id) => {
    const s = SECOES_MESTRE.find(x => x.id === id);
    return s ? s.sub : null;
};

// Seção dentro de um painel escondido (sub-aba inativa) ainda não pode ser rolada.
const estaEscondida = (el) => !!(el && el.closest && el.closest('[hidden]'));

// Rola até a seção (se já está na página e visível). jsdom não implementa scrollIntoView: tratado.
export function rolarParaSecaoMestre(id) {
    const dom = domDaSecaoMestre(id);
    const el = dom && typeof document !== 'undefined' ? document.getElementById(dom) : null;
    if (el && estaEscondida(el)) return false;
    if (el && typeof el.scrollIntoView === 'function') {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* sem rolagem */ }
    }
    return !!el;
}

const TENTATIVAS_ROLAGEM = 10;
const INTERVALO_ROLAGEM_MS = 40;

// Consome o pedido `secaoMestrePedida` quando é desta seção: chama `abrir()` (se for recolhível), limpa o pedido e rola até ela
// depois do próximo quadro (a seção já expandida). Se a sub-aba da seção ainda estiver escondida, tenta de novo por até ~400ms
// (a barra de sub-abas troca de aba no mesmo pedido). O timer só é cancelado ao desmontar (limpar o pedido re-renderiza e a rolagem precisa acontecer).
export default function useSecaoMestre(id, abrir) {
    const pedido = useStore(s => s.secaoMestrePedida);
    const limpar = useStore(s => s.limparSecaoMestrePedida);
    const timer = useRef(null);
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
    useEffect(() => {
        if (!pedido || pedido.id !== id) return;
        if (typeof abrir === 'function') abrir();
        if (typeof limpar === 'function') limpar();
        let restantes = TENTATIVAS_ROLAGEM;
        const tentar = () => {
            timer.current = null;
            const dom = domDaSecaoMestre(id);
            const el = dom ? document.getElementById(dom) : null;
            if (el && estaEscondida(el) && restantes-- > 0) { timer.current = setTimeout(tentar, INTERVALO_ROLAGEM_MS); return; }
            rolarParaSecaoMestre(id);
        };
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(tentar, 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao pedido
    }, [pedido]);
}
