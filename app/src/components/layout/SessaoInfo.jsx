import React from 'react';
import { ref, get, set } from 'firebase/database';
import { db } from '../../services/firebase-config';
import useStore from '../../stores/useStore';
import TrocaRapidaMestre from './TrocaRapidaMestre';

// 🪪 Informações da sessão: quantos estão online, sala, conta/personagem, "Trocar", "Controlar" (Mestre), "Resgatar tudo" (Mestre) e
// "Sair". Vive onde o modo de navegação escolhido tem espaço: na barra do topo, no menu do orbe ou na tela do hub.
// aoTrocarPersonagem: volta à escolha de personagem (o estado "pronto" é do App).
export default function SessaoInfo({ aoTrocarPersonagem, mostrarModoJogador = false }) {
    const jogadoresOnline = useStore(s => s.jogadoresOnline);
    const mesaId = useStore(s => s.mesaId);
    const setMesaId = useStore(s => s.setMesaId);
    const limparFeedStore = useStore(s => s.limparFeedStore);
    const meuNome = useStore(s => s.meuNome);
    const isMestre = useStore(s => s.isMestre);
    const modoJogador = useStore(s => s.modoJogador);
    const souMestreReal = useStore(s => s.souMestreReal);
    const setModoJogador = useStore(s => s.setModoJogador);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const mesaCriador = useStore(s => s.mesaCriador);
    const mesaMestres = useStore(s => s.mesaMestres);

    const criadorOn = jogadoresOnline.filter(j => j === mesaCriador);
    const coMestresOn = jogadoresOnline.filter(j => j !== mesaCriador && mesaMestres[j]);
    const playersOn = jogadoresOnline.filter(j => !mesaMestres[j]);

    let tooltipOnline = '🌟 CONTAS ONLINE NA SALA:\n\n';
    if (criadorOn.length > 0) tooltipOnline += `👑 MESTRE SUPREMO:\n- ${criadorOn.join(', ')}\n\n`;
    if (coMestresOn.length > 0) tooltipOnline += `🛡️ CO-MESTRES:\n- ${coMestresOn.join(', ')}\n\n`;
    if (playersOn.length > 0) tooltipOnline += `⚔️ AVENTUREIROS:\n- ${playersOn.join(', ')}`;
    if (jogadoresOnline.length === 0) tooltipOnline += 'Ninguém online no momento.';

    return (
        <div className="barra-sessao">
            <div title={tooltipOnline} className="sessao-online">
                <span className="sessao-online-ponto"></span>
                <span className="sessao-online-texto">{jogadoresOnline.length} ON</span>
            </div>

            <div className="sessao-divisor"></div>

            <span className="sessao-sala">SALA: {mesaId}</span>
            {modoJogador && souMestreReal && <span className="pill-modo-jogador" title="Você está vendo a mesa como um jogador. As ações automáticas do Mestre (efeitos de zona no turno, pedidos à Sexta-Feira) ficam pausadas neste aparelho. Para voltar a ser Mestre, clique no 🎭 do menu de navegação.">🎭 MODO JOGADOR</span>}

            <div className="sessao-conta">
                <span className="sessao-nome">👤 {meuNome}</span>
                <button className="sessao-botao-trocar" onClick={() => { if (window.confirm('Deseja sair desta ficha e escolher outro personagem?')) { aoTrocarPersonagem(); } }} title="Mudar o nome/ficha atual sem sair da mesa">✏️ Trocar</button>
                <TrocaRapidaMestre />
            </div>

            {mostrarModoJogador && souMestreReal && (
                <button
                    type="button"
                    className={`sessao-botao-modo-jogador btn-modo-jogador${modoJogador ? ' ativa' : ''}`}
                    aria-pressed={modoJogador}
                    title={modoJogador ? 'Modo Jogador ligado — clique para voltar a ser Mestre' : 'Ver a mesa como um jogador (Modo Jogador)'}
                    onClick={() => {
                        const novo = !modoJogador;
                        setModoJogador(novo);
                        // A aba do Mestre some no Modo Jogador: leva pra Ficha em vez de deixar uma aba vazia.
                        if (novo && useStore.getState().abaAtiva === 'aba-mestre') setAbaAtiva('aba-Ficha Def');
                    }}
                >🎭 {modoJogador ? 'Modo Jogador: ligado' : 'Modo Jogador'}</button>
            )}

            {isMestre && (
                <button className="sessao-botao-resgatar" onClick={async () => {
                    const matrizId = localStorage.getItem('rpg_mesa_principal') || 'Nenhuma';
                    if (!matrizId || matrizId === 'Nenhuma') {
                        return alert('⚠️ MESTRE: Defina primeiro o ID da sua Mesa Matriz usando o botão de lápis (✏️) no Hub Cósmico!');
                    }
                    if (!window.confirm(`⚠️ MESTRE: Deseja tentar copiar as estruturas da mesa matriz [${matrizId}] para a sala atual [${mesaId}]?\n\nNota: Se não for o Mestre Criador da Matriz, o Firebase pode bloquear a importação por segurança.`)) return;

                    try {
                        const oldPers = await get(ref(db, `mesas/${matrizId}/personagens`));
                        if (oldPers.exists()) {
                            const data = oldPers.val();
                            for (const key in data) {
                                await set(ref(db, `mesas/${mesaId}/personagens/${key}`), data[key]).catch(() => {});
                            }
                        }
                    } catch (err) {
                        console.warn('Leitura de personagens bloqueada pelo sandbox:', err.message);
                    }

                    try {
                        const oldArvore = await get(ref(db, `mesas/${matrizId}/arvore`));
                        if (oldArvore.exists()) {
                            await set(ref(db, `mesas/${mesaId}/arvore`), oldArvore.val());
                            localStorage.setItem('rpgSextaFeira_arvore', JSON.stringify(oldArvore.val()));
                            alert('✅ SUCESSO SUPREMO! Dados copiados da nuvem da Matriz com sucesso! Atualize a página (F5).');
                        } else {
                            throw new Error('Nó vazio');
                        }
                    } catch (err) {
                        console.warn('Acesso à nuvem da matriz negado. Tentando cache local de segurança...');

                        const arvorePonte = localStorage.getItem('rpgSextaFeira_arvore_MatrizBackup');
                        if (arvorePonte && arvorePonte !== '{}') {
                            try {
                                await set(ref(db, `mesas/${mesaId}/arvore`), JSON.parse(arvorePonte));
                                localStorage.setItem('rpgSextaFeira_arvore', arvorePonte);
                                alert('✅ PONTE LOCAL ATIVADA! O Firebase bloqueou a leitura externa, mas a árvore foi forjada a partir do seu cache local de segurança! Atualize a página (F5).');
                            } catch (writeErr) {
                                alert('❌ ACESSO NEGADO: O Firebase bloqueou a gravação da árvore para a sua conta nesta sala.\n\nDica: Peça ao dono da Matriz para fazer o resgate e selar as permissões!');
                            }
                        } else {
                            alert('❌ ACESSO BLOQUEADO: O Firebase protege salas externas contra leitura. Como o seu navegador não possui o cache original da Matriz, o resgate foi cancelado com segurança.\n\n👉 Peça ao dono da Matriz para fazer o resgate!');
                        }
                    }
                }}>🧲 RESGATAR TUDO</button>
            )}

            <button className="sessao-botao-sair" onClick={() => { if (window.confirm('Tem a certeza que deseja sair da mesa?')) { limparFeedStore(); setMesaId(''); } }} title="Desconectar do Servidor da Mesa">Sair 🚪</button>
        </div>
    );
}
