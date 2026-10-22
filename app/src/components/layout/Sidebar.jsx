import React, { useState, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { ordenarPedidosPendentes } from '../../core/sextaFeiraCriacao';
import { GRUPOS_NAVEGACAO, ABA_MESTRE } from '../../core/navegacao';

const CHAVE_EXPANDIDA = 'rpgSidebarExpandida';

function lerExpandida() {
    try { return localStorage.getItem(CHAVE_EXPANDIDA) === '1'; } catch (e) { return false; }
}

// 🧭 Barra de navegação (no topo da tela): TODAS as abas à vista, agrupadas por assunto — um clique pra ir a qualquer uma.
// A aba atual mostra o nome; as outras só o ícone (o nome aparece ao passar o mouse). O botão ↔ mostra o nome de todas.
// Ctrl+K abre a Paleta "Ir para..." (PaletaNavegacao). O lado direito leva as informações da sessão (children: sala, conta, sair).
// (O arquivo mantém o nome Sidebar por histórico: antes era uma barra lateral.)
export default function Sidebar({ onResetClick, children }) {
    const abaAtiva = useStore(s => s.abaAtiva);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const isMestre = useStore(s => s.isMestre);
    // 🎭 Modo Jogador: quem é Mestre/Co-Mestre de verdade (souMestreReal) pode ver a mesa como jogador.
    const souMestreReal = useStore(s => s.souMestreReal);
    const modoJogador = useStore(s => s.modoJogador);
    const setModoJogador = useStore(s => s.setModoJogador);
    // 🔔 Pedidos de criação dos jogadores à Sexta-Feira esperando o Mestre (detalhes na aba do Mestre).
    const qtdPedidos = useStore(s => (s.isMestre ? ordenarPedidosPendentes(s.sextaFeiraPendentes).length : 0));

    const [expandida, setExpandida] = useState(lerExpandida);

    const alternarExpandida = useCallback(() => {
        const novo = !expandida;
        setExpandida(novo);
        try { localStorage.setItem(CHAVE_EXPANDIDA, novo ? '1' : '0'); } catch (e) { /* sem localStorage */ }
    }, [expandida]);

    const alternarModoJogador = useCallback(() => {
        const novo = !modoJogador;
        setModoJogador(novo);
        // A aba do Mestre some no Modo Jogador: leva pra Ficha em vez de deixar uma aba vazia.
        if (novo && useStore.getState().abaAtiva === 'aba-mestre') setAbaAtiva('aba-Ficha Def');
    }, [modoJogador, setModoJogador, setAbaAtiva]);

    return (
        <nav className={`sidebar-magica barra-navegacao${expandida ? ' sidebar-expandida' : ''}`} aria-label="Navegação principal">
            <div className="nav-lista">
                {souMestreReal && (
                    <div className="nav-grupo nav-grupo-mestre">
                        {isMestre && (
                            <button
                                type="button"
                                title={qtdPedidos > 0 ? `${ABA_MESTRE.nome} — ${qtdPedidos} pedido(s) aguardando aprovação` : ABA_MESTRE.nome}
                                className={`nav-item btn-macro btn-macro-mestre ${abaAtiva === 'aba-mestre' ? 'ativa' : ''}`}
                                onClick={() => setAbaAtiva('aba-mestre')}
                            >
                                <span className="nav-icone">{ABA_MESTRE.icone}{qtdPedidos > 0 && <span className="sidebar-badge-pedidos" aria-label={`${qtdPedidos} pedido(s) aguardando aprovação`}>{qtdPedidos > 9 ? '9+' : qtdPedidos}</span>}</span>
                                <span className="nav-rotulo">Mestre</span>
                            </button>
                        )}
                        <button
                            type="button"
                            title={modoJogador ? 'Modo Jogador ligado — clique para voltar a ser Mestre' : 'Ver a mesa como um jogador (Modo Jogador)'}
                            aria-pressed={modoJogador}
                            className={`nav-item btn-macro btn-modo-jogador ${modoJogador ? 'ativa' : ''}`}
                            onClick={alternarModoJogador}
                        >
                            <span className="nav-icone">🎭</span>
                            <span className="nav-rotulo">Modo Jogador</span>
                        </button>
                    </div>
                )}

                {GRUPOS_NAVEGACAO.map(grupo => (
                    <div key={grupo.id} className={`nav-grupo nav-grupo-${grupo.id}`} role="group" aria-label={grupo.nome}>
                        <div className="nav-grupo-titulo">{grupo.nome}</div>
                        {grupo.abas.map(aba => (
                            <button
                                key={aba.id}
                                type="button"
                                title={aba.nome}
                                aria-label={aba.nome}
                                aria-current={abaAtiva === aba.id ? 'page' : undefined}
                                className={`nav-item ${abaAtiva === aba.id ? 'ativa' : ''}`}
                                onClick={() => setAbaAtiva(aba.id)}
                            >
                                <span className="nav-icone">{aba.icone}</span>
                                <span className="nav-rotulo">{aba.curto || aba.nome}</span>
                            </button>
                        ))}
                    </div>
                ))}

                <div className="nav-grupo nav-rodape">
                    <button type="button" className="nav-item nav-atalho" title="Ir para qualquer aba (Ctrl+K)" onClick={() => window.dispatchEvent(new Event('abrir-paleta-navegacao'))}>
                        <span className="nav-icone">🔎</span>
                        <span className="nav-rotulo">Ir para <kbd>Ctrl+K</kbd></span>
                    </button>
                    <button type="button" className="nav-item nav-expandir" title={expandida ? 'Mostrar só os ícones' : 'Mostrar o nome de todas as abas'} aria-pressed={expandida} onClick={alternarExpandida}>
                        <span className="nav-icone">↔</span>
                        <span className="nav-rotulo">{expandida ? 'Só ícones' : 'Nomes'}</span>
                    </button>
                </div>
            </div>
            {children && <div className="barra-lado-direito">{children}</div>}
        </nav>
    );
}
