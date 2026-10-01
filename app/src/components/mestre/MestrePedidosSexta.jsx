import React, { useEffect, useMemo, useRef, useState } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { useMestreForm } from './MestreFormContext';
import usePedidosCriacao from '../../hooks/usePedidosCriacao';
import DetalhesCriacao from '../ia/DetalhesCriacao';
import { descreverDestinoPedido, ordenarPedidosPendentes, resumirProposta, tempoDesde } from '../../core/sextaFeiraCriacao';
import { abaDoPedido } from '../../core/grimorioLeitura';

// 🔔 PEDIDOS DE CRIAÇÃO DA SEXTA-FEIRA NA ABA DO MESTRE
// Quando um jogador pede à Sexta-Feira uma Habilidade/Técnica/Item e manda pra aprovação, o pedido
// entra em `sextaFeiraPendentes` (escuta global em hooks/useSextaFeiraMesa.js). Aqui:
//   MestreNotificacoesPedidos — os avisos no topo da aba do Mestre, com "Ver a Habilidade";
//   PedidosNaFicha            — o pedido em destaque dentro do Grimório de quem pediu, no lugar
//                               onde ele vai entrar, com Aprovar / Recusar.
// As regras de aprovar/recusar são as mesmas do painel da Sexta-Feira (hooks/usePedidosCriacao.js).

// Os avisos e a confirmação ficam na própria tela: o Grimório é uma janela por cima de tudo e as
// janelas da Sexta-Feira abririam por baixo dela.
function useAvisoLocal() {
    const [aviso, setAviso] = useState(null);
    useEffect(() => {
        if (!aviso) return undefined;
        const t = setTimeout(() => setAviso(null), 8000);
        return () => clearTimeout(t);
    }, [aviso]);
    const dialogos = useMemo(() => ({
        avisar: (mensagem, tipo = 'ok') => setAviso({ mensagem, tipo, id: Date.now() }),
        confirmar: async () => true,
    }), []);
    return { aviso, dialogos };
}

function AvisoPedido({ aviso }) {
    if (!aviso) return null;
    return <div className={`pedido-aviso pedido-aviso-${aviso.tipo}`} role="status">{aviso.mensagem}</div>;
}

// Recusar pede um segundo clique ("Confirmar recusa"), sem janela por cima.
function BotoesDecisao({ id, ocupado, aoAprovar, aoRecusar }) {
    const [confirmando, setConfirmando] = useState(false);
    if (confirmando) {
        return (
            <div className="sexta-criacao-acoes">
                <span className="pedido-confirmar-texto">Recusar este pedido?</span>
                <button type="button" className="sexta-chip-btn vermelho" disabled={ocupado} onClick={() => { setConfirmando(false); aoRecusar(id); }}>❌ Confirmar recusa</button>
                <button type="button" className="sexta-chip-btn" disabled={ocupado} onClick={() => setConfirmando(false)}>Voltar</button>
            </div>
        );
    }
    return (
        <div className="sexta-criacao-acoes">
            {aoAprovar && <button type="button" className="sexta-chip-btn verde" disabled={ocupado} onClick={() => aoAprovar(id)}>✅ Aprovar</button>}
            <button type="button" className="sexta-chip-btn vermelho" disabled={ocupado} onClick={() => setConfirmando(true)}>❌ Recusar</button>
        </div>
    );
}

// Nome da ficha na mesa (chave de `personagens`) de quem pediu, ou null se não existe mais.
function acharNomeNaMesa(personagens, nome) {
    const alvo = sanitizarNome(nome || '');
    if (!alvo) return null;
    return Object.keys(personagens || {}).find(n => sanitizarNome(n) === alvo) || null;
}

export function MestreNotificacoesPedidos() {
    const ctx = useMestreForm();
    const pendentes = useStore(s => s.sextaFeiraPendentes);
    const personagens = useStore(s => s.personagens);
    const [agora, setAgora] = useState(() => Date.now());
    const [ocupado, setOcupado] = useState(null);
    const { aviso, dialogos } = useAvisoLocal();
    const { recusarPendente } = usePedidosCriacao(dialogos);
    const pedidos = useMemo(() => ordenarPedidosPendentes(pendentes), [pendentes]);

    // Atualiza o "há X min".
    useEffect(() => {
        const t = setInterval(() => setAgora(Date.now()), 30000);
        return () => clearInterval(t);
    }, []);

    if (!ctx || !ctx.isMestre || (pedidos.length === 0 && !aviso)) return null;

    const recusar = async (id) => {
        setOcupado(id);
        try { await recusarPendente(id, { semConfirmar: true }); } finally { setOcupado(null); }
    };

    return (
        <div className="mestre-notificacoes" role="region" aria-label="Pedidos de criação dos jogadores">
            <div className="mestre-notificacoes-titulo">
                <span className="mestre-notificacoes-sino" aria-hidden="true">🔔</span>
                {pedidos.length === 1 ? '1 pedido da Sexta-Feira aguardando sua aprovação' : `${pedidos.length} pedidos da Sexta-Feira aguardando sua aprovação`}
            </div>
            <AvisoPedido aviso={aviso} />
            {pedidos.map(([id, p]) => {
                const destino = descreverDestinoPedido(p.tipo, p.objeto);
                const nomeNaMesa = acharNomeNaMesa(personagens, p.alvo || p.solicitante);
                const avisos = Array.isArray(p.avisos) ? p.avisos.length : 0;
                return (
                    <div key={id} className="mestre-notificacao">
                        <div className="mestre-notificacao-cabecalho">
                            <span><strong>{p.solicitante || 'Alguém'}</strong> pediu {destino.oQue}</span>
                            <small>{tempoDesde(p.em, agora)}</small>
                        </div>
                        <div className="mestre-notificacao-nome">{p.objeto.nome}</div>
                        <dl className="mestre-notificacao-dados">
                            <dt>Página</dt><dd>{destino.pagina} › {destino.local}</dd>
                            <dt>Tipo</dt><dd>{destino.tipo}</dd>
                            <dt>Resumo</dt><dd>{resumirProposta(p.tipo, p.objeto)}</dd>
                            {avisos > 0 && <><dt>Atenção</dt><dd className="mestre-notificacao-alerta">⚠️ {avisos === 1 ? '1 aviso de equilíbrio' : `${avisos} avisos de equilíbrio`}</dd></>}
                        </dl>
                        {nomeNaMesa ? (
                            <div className="sexta-criacao-acoes">
                                <button type="button" className="btn-neon btn-blue mestre-notificacao-ver" onClick={() => ctx.verPedidoNaFicha(id, nomeNaMesa)}>
                                    👁️ {destino.botaoVer}
                                </button>
                            </div>
                        ) : (
                            <>
                                <div className="mestre-notificacao-alerta">A ficha de {p.alvo || p.solicitante} não foi encontrada nesta mesa.</div>
                                <BotoesDecisao id={id} ocupado={ocupado === id} aoRecusar={recusar} />
                            </>
                        )}
                    </div>
                );
            })}
        </div>
    );
}

// Pedidos de UM personagem para UMA aba do Grimório do Mestre (`aba`: 'habilidade' | 'poder' |
// 'forma' | 'magias' | 'inventario', ver core/grimorioLeitura.js) — ou, sem `aba`, para uma
// seção ('poderes' | 'magias' | 'inventario'). O pedido em foco (vindo do "Ver a Habilidade") fica
// destacado e a janela rola até ele.
export function PedidosNaFicha({ nome, secao, aba, pedidoFocoId }) {
    const pendentes = useStore(s => s.sextaFeiraPendentes);
    const isMestre = useStore(s => s.isMestre);
    const [ocupado, setOcupado] = useState(null);
    const { aviso, dialogos } = useAvisoLocal();
    const { aprovarPendente, recusarPendente } = usePedidosCriacao(dialogos);
    const focoRef = useRef(null);

    const pedidos = useMemo(() => {
        const alvo = sanitizarNome(nome || '');
        return ordenarPedidosPendentes(pendentes).filter(([, p]) =>
            sanitizarNome(p.alvo || p.solicitante) === alvo
            && (aba ? abaDoPedido(p) === aba : descreverDestinoPedido(p.tipo, p.objeto).secao === secao));
    }, [pendentes, nome, secao, aba]);
    const temFoco = pedidos.some(([id]) => id === pedidoFocoId);

    useEffect(() => {
        if (temFoco && focoRef.current && typeof focoRef.current.scrollIntoView === 'function') {
            focoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [temFoco, pedidoFocoId]);

    if (!isMestre || (pedidos.length === 0 && !aviso)) return null;

    const agir = async (fn, id, opcoes) => {
        setOcupado(id);
        try { await fn(id, opcoes); } finally { setOcupado(null); }
    };

    return (
        <div className="pedidos-ficha">
            <AvisoPedido aviso={aviso} />
            {pedidos.map(([id, p]) => {
                const destino = descreverDestinoPedido(p.tipo, p.objeto);
                const emFoco = id === pedidoFocoId;
                return (
                    <div key={id} ref={emFoco ? focoRef : null} className={`pedido-ficha${emFoco ? ' em-foco' : ''}`}>
                        <div className="pedido-ficha-topo">
                            <span className="pedido-ficha-selo">⏳ Aguardando sua aprovação</span>
                            <strong className="pedido-ficha-nome">{p.objeto.nome}</strong>
                        </div>
                        <div className="pedido-ficha-meta">
                            Pedido de {p.solicitante} à Sexta-Feira · {destino.pagina} › {destino.local} · {destino.tipo}
                        </div>
                        <DetalhesCriacao tipo={p.tipo} objeto={p.objeto} avisos={p.avisos} />
                        <BotoesDecisao
                            id={id}
                            ocupado={ocupado === id}
                            aoAprovar={(pid) => agir(aprovarPendente, pid)}
                            aoRecusar={(pid) => agir(recusarPendente, pid, { semConfirmar: true })}
                        />
                    </div>
                );
            })}
        </div>
    );
}
