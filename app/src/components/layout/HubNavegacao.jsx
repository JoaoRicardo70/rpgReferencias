import React, { useMemo } from 'react';
import useStore from '../../stores/useStore';
import { ordenarPedidosPendentes } from '../../core/sextaFeiraCriacao';
import { MODOS_HUB, modoHubDaAba, ABA_HUB } from '../../core/modoNavegacao';
import { listarDestinos, ABA_MESTRE } from '../../core/navegacao';

// 🏠 Modo "Hub por modos": a tela "Mesa" com um cartão grande por modo (Ficha, Combate, Mapa, Social, Lore, Perfil e, pro Mestre,
// o Painel do Mestre). Clicar no cartão abre a aba principal do modo; os chips abrem uma aba específica dele.
export default function HubNavegacao({ sessao }) {
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const isMestre = useStore(s => s.isMestre);
    const meuNome = useStore(s => s.meuNome);
    const qtdPedidos = useStore(s => (s.isMestre ? ordenarPedidosPendentes(s.sextaFeiraPendentes).length : 0));

    const nomes = useMemo(() => {
        const mapa = {};
        listarDestinos({ isMestre }).forEach(d => { mapa[d.id] = d; });
        return mapa;
    }, [isMestre]);

    return (
        <div className="hub">
            <div className="hub-topo">
                <div>
                    <h2 className="hub-titulo">Mesa</h2>
                    <p className="hub-subtitulo">Para onde vamos, {meuNome || 'aventureiro'}?</p>
                </div>
                {sessao && <div className="hub-sessao">{sessao}</div>}
            </div>

            <div className="hub-cartoes">
                {isMestre && (
                    <div className="hub-cartao nav-grupo-mestre">
                        <button type="button" className="hub-cartao-corpo" onClick={() => setAbaAtiva(ABA_MESTRE.id)}>
                            <span className="hub-cartao-icone">{ABA_MESTRE.icone}{qtdPedidos > 0 && <span className="sidebar-badge-pedidos">{qtdPedidos > 9 ? '9+' : qtdPedidos}</span>}</span>
                            <span className="hub-cartao-nome">Mestre</span>
                            <span className="hub-cartao-desc">Painel do Mestre{qtdPedidos > 0 ? ` — ${qtdPedidos} pedido(s) aguardando` : ''}</span>
                        </button>
                    </div>
                )}
                {MODOS_HUB.map(m => (
                    <div key={m.id} className={`hub-cartao nav-grupo-${m.cor}`}>
                        <button type="button" className="hub-cartao-corpo" onClick={() => setAbaAtiva(m.abas[0])}>
                            <span className="hub-cartao-icone">{m.icone}</span>
                            <span className="hub-cartao-nome">{m.nome}</span>
                            <span className="hub-cartao-desc">{m.descricao}</span>
                        </button>
                        {m.abas.length > 1 && (
                            <div className="hub-cartao-chips">
                                {m.abas.map(id => nomes[id] && (
                                    <button key={id} type="button" className="hub-chip" onClick={() => setAbaAtiva(id)}>{nomes[id].icone} {nomes[id].curto || nomes[id].nome}</button>
                                ))}
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <p className="hub-dica">Dica: <kbd>Ctrl</kbd>+<kbd>K</kbd> abre a busca "Ir para..." de qualquer lugar.</p>
        </div>
    );
}

// Faixa fina que aparece DENTRO de um modo do hub: volta pra Mesa e mostra as abas irmãs do modo atual (quando há mais de uma).
export function BarraModoHub() {
    const abaAtiva = useStore(s => s.abaAtiva);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const isMestre = useStore(s => s.isMestre);

    const modo = modoHubDaAba(abaAtiva);
    const nomes = useMemo(() => {
        const mapa = {};
        listarDestinos({ isMestre }).forEach(d => { mapa[d.id] = d; });
        return mapa;
    }, [isMestre]);

    if (abaAtiva === ABA_HUB) return null;
    const atual = nomes[abaAtiva];

    return (
        <div className="hub-minibarra" role="navigation" aria-label="Navegação do modo">
            <button type="button" className="hub-voltar" onClick={() => setAbaAtiva(ABA_HUB)} title="Voltar à tela Mesa">🏠 Mesa</button>
            <span className="hub-modo-nome">{modo ? `${modo.icone} ${modo.nome}` : (atual ? `${atual.icone} ${atual.nome}` : '')}</span>
            {modo && modo.abas.length > 1 && (
                <div className="hub-subabas">
                    {modo.abas.map(id => nomes[id] && (
                        <button key={id} type="button" className={`hub-subaba${id === abaAtiva ? ' ativa' : ''}`} aria-current={id === abaAtiva ? 'page' : undefined} onClick={() => setAbaAtiva(id)}>{nomes[id].icone} {nomes[id].curto || nomes[id].nome}</button>
                    ))}
                </div>
            )}
            <button type="button" className="hub-busca" title="Ir para qualquer aba (Ctrl+K)" onClick={() => window.dispatchEvent(new Event('abrir-paleta-navegacao'))}>🔎</button>
        </div>
    );
}
