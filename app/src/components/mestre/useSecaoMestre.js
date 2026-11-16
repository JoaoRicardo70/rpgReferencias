import { useEffect } from 'react';
import useStore from '../../stores/useStore';

// 🧭 Seções da aba Mestre que o painel de atalhos e os links de outras telas sabem alcançar (pedirSecaoMestre(id) no store).
// `dom` é o id estável do elemento da seção na página.
export const SECOES_MESTRE = [
    { id: 'pedidos', dom: 'mestre-sec-pedidos', rotulo: '🔔 Pedidos' },
    { id: 'turnos', dom: 'mestre-sec-turnos', rotulo: '⚔️ Turnos' },
    { id: 'equipes', dom: 'mestre-sec-equipes', rotulo: '🛡️ Equipes e Relações' },
    { id: 'racas', dom: 'mestre-sec-racas', rotulo: '🧬 Raças' },
    { id: 'segurar', dom: 'mestre-sec-segurar', rotulo: '⏳ Segurar Ação' },
    { id: 'jogadores', dom: 'mestre-sec-jogadores', rotulo: '👥 Jogadores' },
    { id: 'forja', dom: 'mestre-sec-forja', rotulo: '🏗️ Forja de Vilões' },
];

export const domDaSecaoMestre = (id) => {
    const s = SECOES_MESTRE.find(x => x.id === id);
    return s ? s.dom : null;
};

// Rola até a seção (se já está na página). jsdom não implementa scrollIntoView: tratado.
export function rolarParaSecaoMestre(id) {
    const dom = domDaSecaoMestre(id);
    const el = dom && typeof document !== 'undefined' ? document.getElementById(dom) : null;
    if (el && typeof el.scrollIntoView === 'function') {
        try { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch (e) { /* sem rolagem */ }
    }
    return !!el;
}

// Consome o pedido `secaoMestrePedida` quando é desta seção: chama `abrir()` (se for recolhível), limpa o pedido e rola até ela
// depois do próximo quadro (a seção já expandida). Não cancela o timer no cleanup: limpar o pedido re-renderiza e o rolar precisa acontecer.
export default function useSecaoMestre(id, abrir) {
    const pedido = useStore(s => s.secaoMestrePedida);
    const limpar = useStore(s => s.limparSecaoMestrePedida);
    useEffect(() => {
        if (!pedido || pedido.id !== id) return;
        if (typeof abrir === 'function') abrir();
        if (typeof limpar === 'function') limpar();
        setTimeout(() => rolarParaSecaoMestre(id), 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só reage ao pedido
    }, [pedido]);
}
