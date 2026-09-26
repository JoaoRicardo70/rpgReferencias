import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import useStore from '../../stores/useStore';
import { VoiceContext } from '../../hooks/VoiceContext';
import { ChatContext } from '../../hooks/ChatContext';
import { salvarCenarioCompleto } from '../../services/firebase-sync';
import {
    LIMITE_NOME_GRUPO, LIMITE_TEXTO_MENSAGEM, alternarPresencaNaTaverna,
    descreverErroChat, formatarHoraMensagem, iconeDoChat, nomeDoChat
} from '../../core/chats';
import { ultimoErroChat } from '../../services/chat-sync';
import AvatarPersonagem from './AvatarPersonagem';
import { AvatarCardVoz, CalibradorDeVoz } from '../mapa/MapaVoz';
import { infoAvatarDaFicha } from '../../core/avatar';
import { idDeVoz } from '../../core/volumesVoz';
import { useBufferLigado } from '../../core/estadoBuffer';

function JanelaDoChat({ chat, meuNome, mensagens, onEnviar, onVoltar, onSair }) {
    const [texto, setTexto] = useState('');
    const [erro, setErro] = useState('');
    const fimRef = useRef(null);

    useEffect(() => {
        if (fimRef.current && fimRef.current.scrollIntoView) fimRef.current.scrollIntoView({ block: 'end' });
    }, [mensagens.length, chat.id]);

    const enviar = async (e) => {
        e.preventDefault();
        const t = texto;
        if (!t.trim()) return;
        setTexto('');
        const ok = await onEnviar(chat.id, t);
        setErro(ok ? '' : descreverErroChat(ultimoErroChat()));
    };

    return (
        <div className="dock-com-janela">
            <div className="dock-com-janela-topo">
                <button type="button" className="dock-com-voltar" onClick={onVoltar} title="Voltar para as conversas">←</button>
                <span className="dock-com-janela-titulo">
                    {chat.tipo === 'privado' ? <AvatarPersonagem nome={nomeDoChat(chat, meuNome)} tamanho={28} /> : iconeDoChat(chat)} {nomeDoChat(chat, meuNome)}
                </span>
                {chat.tipo !== 'party' && (
                    <button type="button" className="dock-com-sair" onClick={() => onSair(chat)} title="Sair desta conversa">Sair</button>
                )}
            </div>
            {chat.tipo === 'grupo' && <div className="dock-com-membros">{chat.membros.join(', ')}</div>}
            <div className="dock-com-mensagens">
                {mensagens.length === 0 && <div className="dock-com-vazio">Nenhuma mensagem ainda. Diga olá!</div>}
                {mensagens.map(m => (
                    <div key={m.id} className={`dock-com-linha${m.autor === meuNome ? ' minha' : ''}`}>
                        <AvatarPersonagem nome={m.autor} tamanho={34} />
                        <div className={`dock-com-msg${m.autor === meuNome ? ' minha' : ''}`}>
                            <span className="dock-com-msg-autor">{m.autor === meuNome ? 'Você' : m.autor} <small>{formatarHoraMensagem(m.ts)}</small></span>
                            <span className="dock-com-msg-texto">{m.texto}</span>
                        </div>
                    </div>
                ))}
                <div ref={fimRef} />
            </div>
            {erro && <div className="dock-com-erro" role="alert">{erro}</div>}
            <form className="dock-com-form" onSubmit={enviar}>
                <input className="input-neon" value={texto} maxLength={LIMITE_TEXTO_MENSAGEM} onChange={e => setTexto(e.target.value)} placeholder="Escreva uma mensagem..." aria-label="Mensagem" />
                <button type="submit" className="btn-neon btn-green" disabled={!texto.trim()}>Enviar</button>
            </form>
        </div>
    );
}

function NovoChat({ candidatos, naTaverna, onPrivado, onGrupo, onCancelar }) {
    const [modo, setModo] = useState('privado');
    const [nomeGrupo, setNomeGrupo] = useState('');
    const [escolhidos, setEscolhidos] = useState([]);
    const [ocupado, setOcupado] = useState(false);

    const alternar = (nome) => setEscolhidos(prev => prev.includes(nome) ? prev.filter(n => n !== nome) : [...prev, nome]);
    const podeCriarGrupo = nomeGrupo.trim().length > 0 && escolhidos.length >= 1;

    const criarGrupo = async () => {
        setOcupado(true);
        const ok = await onGrupo(nomeGrupo, escolhidos);
        setOcupado(false);
        if (!ok) alert('Não foi possível criar o grupo. Tente novamente.');
    };

    return (
        <div className="dock-com-novo">
            <div className="dock-com-abas">
                <button type="button" className={modo === 'privado' ? 'ativa' : ''} onClick={() => setModo('privado')}>👤 Privado</button>
                <button type="button" className={modo === 'grupo' ? 'ativa' : ''} onClick={() => setModo('grupo')}>👥 Grupo</button>
            </div>
            {modo === 'grupo' && (
                <input className="input-neon" value={nomeGrupo} maxLength={LIMITE_NOME_GRUPO} onChange={e => setNomeGrupo(e.target.value)} placeholder="Nome do grupo" aria-label="Nome do grupo" />
            )}
            <div className="dock-com-candidatos">
                {candidatos.length === 0 && <div className="dock-com-vazio">Nenhum outro personagem na mesa ainda.</div>}
                {candidatos.map(nome => (
                    modo === 'privado' ? (
                        <button type="button" key={nome} className="dock-com-candidato" onClick={() => onPrivado(nome)}>
                            <AvatarPersonagem nome={nome} tamanho={28} /> {naTaverna.includes(nome) ? '🟢' : '⚪'} {nome}
                        </button>
                    ) : (
                        <label key={nome} className="dock-com-candidato">
                            <input type="checkbox" checked={escolhidos.includes(nome)} onChange={() => alternar(nome)} /> <AvatarPersonagem nome={nome} tamanho={28} /> {nome}
                        </label>
                    )
                ))}
            </div>
            <div className="dock-com-acoes">
                <button type="button" className="btn-neon btn-red" onClick={onCancelar}>Cancelar</button>
                {modo === 'grupo' && <button type="button" className="btn-neon btn-green" disabled={!podeCriarGrupo || ocupado} onClick={criarGrupo}>Criar grupo</button>}
            </div>
        </div>
    );
}

export function AbaChats({ chat, candidatos, naTaverna }) {
    const meuNome = chat.eu;
    const [aberto, setAberto] = useState(null);
    const [criando, setCriando] = useState(false);
    const { chats, mensagens, naoLidas, marcarLido, enviar, abrirPrivado, criarGrupo, sair } = chat;

    const chatAberto = aberto ? chats.find(c => c.id === aberto) : null;
    const listaAberta = chatAberto ? (mensagens[chatAberto.id] || []) : [];
    // Usa o id da última mensagem (e não a contagem): com o limite de 100, a contagem para de mudar.
    const qtdAberto = listaAberta.length ? listaAberta[listaAberta.length - 1].id : '';

    // Enquanto a conversa está aberta, tudo que chega conta como lido.
    const idAberto = chatAberto ? chatAberto.id : null;
    useEffect(() => {
        if (idAberto) marcarLido(idAberto);
    }, [idAberto, qtdAberto, marcarLido]);

    // Se a conversa aberta some (saiu do grupo), volta para a lista.
    useEffect(() => { if (aberto && !chatAberto) setAberto(null); }, [aberto, chatAberto]);

    const abrirDm = async (nome) => {
        const id = await abrirPrivado(nome);
        if (id) { setCriando(false); setAberto(id); }
        else alert('Não foi possível abrir a conversa. Tente novamente.');
    };
    const novoGrupo = async (nome, membros) => {
        const id = await criarGrupo(nome, membros);
        if (id) { setCriando(false); setAberto(id); }
        return !!id;
    };
    const sairDoChat = (c) => {
        if (window.confirm(`Sair da conversa "${nomeDoChat(c, meuNome)}"?`)) { setAberto(null); sair(c.id); }
    };

    if (criando) return <NovoChat candidatos={candidatos} naTaverna={naTaverna} onPrivado={abrirDm} onGrupo={novoGrupo} onCancelar={() => setCriando(false)} />;
    if (chatAberto) {
        return <JanelaDoChat chat={chatAberto} meuNome={meuNome} mensagens={mensagens[chatAberto.id] || []} onEnviar={enviar} onVoltar={() => setAberto(null)} onSair={sairDoChat} />;
    }

    return (
        <div className="dock-com-lista">
            {chats.map(c => {
                const lista = mensagens[c.id] || [];
                const ultima = lista[lista.length - 1];
                const n = naoLidas[c.id] || 0;
                return (
                    <button type="button" key={c.id} className="dock-com-item" onClick={() => setAberto(c.id)}>
                        <span className="dock-com-item-icone">{c.tipo === 'privado' ? <AvatarPersonagem nome={nomeDoChat(c, meuNome)} tamanho={36} /> : iconeDoChat(c)}</span>
                        <span className="dock-com-item-corpo">
                            <strong>{nomeDoChat(c, meuNome)}</strong>
                            <small>{ultima ? `${ultima.autor === meuNome ? 'Você' : ultima.autor}: ${ultima.texto}` : (c.tipo === 'party' ? 'Todos da mesa' : 'Sem mensagens')}</small>
                        </span>
                        {n > 0 && <span className="dock-com-badge">{n > 99 ? '99+' : n}</span>}
                    </button>
                );
            })}
            <button type="button" className="btn-neon btn-blue dock-com-novo-btn" onClick={() => setCriando(true)}>+ Nova conversa</button>
        </div>
    );
}

const fmtNumero = (n) => Number(n || 0).toLocaleString('pt-BR');

// Sala da Party: cartões grandes com a imagem do personagem (como no Mapa), quem fala acende,
// controles de microfone/saída e calibrador. O áudio dos outros toca no player global (AudioVozGlobal).
export function AbaVoz({ voz, estouNaCall, naTaverna, alternarPresenca, meuNome, compacto }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const personagens = useStore(s => s.personagens);
    const tamanhoCartao = compacto ? '100%' : (naTaverna.length === 1 ? '400px' : naTaverna.length === 2 ? '350px' : '280px');
    const mics = voz.mics || [];
    const speakers = voz.speakers || [];

    return (
        <div className="dock-com-voz sala-party">
            <div className="sala-party-barra">
                <div className={`dock-com-voz-status${voz.voiceStatus.startsWith('⚠️') ? ' gravador-aviso' : ''}`} role={voz.voiceStatus.startsWith('⚠️') ? 'alert' : undefined}>📡 {voz.voiceStatus}</div>
                <div className="dock-com-voz-botoes">
                    <button type="button" className={`dock-com-redondo${voz.mutado ? ' ativo' : ''}`} disabled={!estouNaCall} onClick={voz.toggleMute} title={voz.mutado ? 'Ativar microfone' : 'Silenciar microfone'}>{voz.mutado ? '🔇' : '🎙️'}</button>
                    <button type="button" className={`dock-com-redondo${voz.surdo ? ' ativo' : ''}`} disabled={!estouNaCall} onClick={voz.toggleDeafen} title={voz.surdo ? 'Voltar a ouvir' : 'Ensurdecer'}>{voz.surdo ? '🔕' : '🎧'}</button>
                    <button type="button" className={`btn-neon ${estouNaCall ? 'btn-red' : 'btn-green'}`} onClick={alternarPresenca}>{estouNaCall ? 'Sair da call' : 'Entrar na call'}</button>
                </div>
                {estouNaCall && (
                    <div className="sala-party-ajustes">
                        {mics.length > 0 && (
                            <label className="sala-party-campo">🎙️
                                <select className="input-neon" value={voz.selectedMic} onChange={e => voz.trocarMicrofone(e.target.value)} aria-label="Microfone">
                                    {mics.map(m => <option key={m.deviceId} value={m.deviceId}>{m.label || `Mic ${m.deviceId.substring(0, 4)}`}</option>)}
                                </select>
                            </label>
                        )}
                        {speakers.length > 0 && (
                            <label className="sala-party-campo">🎧
                                <select className="input-neon" value={voz.selectedSpeaker} onChange={e => voz.trocarSpeaker(e.target.value)} aria-label="Saída de áudio">
                                    {speakers.map(s => <option key={s.deviceId} value={s.deviceId}>{s.label || `Saída ${s.deviceId.substring(0, 4)}`}</option>)}
                                </select>
                            </label>
                        )}
                        <label className="sala-party-campo">
                            <input type="checkbox" checked={!!voz.supressorAtivo} onChange={e => voz.setSupressorAtivo(e.target.checked)} /> Filtro de Eco
                        </label>
                        {voz.streamAnalisador && <CalibradorDeVoz stream={voz.streamAnalisador} sensibilidade={voz.sensibilidadeVoz} setSensibilidade={voz.setSensibilidadeVoz} />}
                    </div>
                )}
            </div>

            <div className="sala-party-titulo">Na Sala da Party ({naTaverna.length})</div>
            {naTaverna.length === 0 && <div className="dock-com-vazio">Ninguém na call agora. Clique em "Entrar na call" para sentar na mesa.</div>}
            <div className={`sala-party-grade${compacto ? ' compacta' : ''}`}>
                {naTaverna.map(nome => {
                    const souEu = nome === meuNome;
                    const ficha = souEu ? (minhaFicha || personagens?.[nome]) : personagens?.[nome];
                    const conexao = (voz.conexoes || []).find(c => c.id === idDeVoz(nome));
                    return (
                        <AvatarCardVoz
                            key={nome} nome={nome} info={infoAvatarDaFicha(ficha)} ficha={ficha} isMe={souEu}
                            isConnected={souEu || !!conexao} streamParaTocar={conexao?.stream} iceState={conexao?.iceState}
                            streamAnalisador={souEu ? voz.streamAnalisador : null}
                            mutado={voz.mutado} surdo={voz.surdo} fazerChamada={voz.fazerChamada}
                            cardSize={tamanhoCartao} fmt={fmtNumero} selectedSpeaker={voz.selectedSpeaker}
                        />
                    );
                })}
            </div>
        </div>
    );
}

// Painel completo (abas Chats e Sala da Party). Usado no botão flutuante e na aba Comunicação.
export function PainelComunicacao({ onFechar, className = '' }) {
    const voz = useContext(VoiceContext);
    const chat = useContext(ChatContext);
    const meuNome = useStore(s => s.meuNome);
    const cenario = useStore(s => s.cenario);
    const personagens = useStore(s => s.personagens);
    const [aba, setAba] = useState('chats');

    const naTaverna = useMemo(() => (Array.isArray(cenario?.tavernaAtivos) ? cenario.tavernaAtivos : []), [cenario]);
    const estouNaCall = naTaverna.includes(meuNome);
    const candidatos = useMemo(() => Object.keys(personagens || {}).filter(n => n && n !== meuNome).sort((a, b) => a.localeCompare(b)), [personagens, meuNome]);

    const alternarPresenca = useCallback(() => {
        salvarCenarioCompleto(alternarPresencaNaTaverna(cenario, meuNome));
    }, [cenario, meuNome]);

    if (!voz || !chat) return null;
    const total = chat.totalNaoLidas;

    return (
        <div className={`painel-com ${className}`.trim()} role={onFechar ? 'dialog' : 'region'} aria-label="Comunicação">
            <div className="dock-com-cabecalho">
                <div className="dock-com-abas">
                    <button type="button" className={aba === 'chats' ? 'ativa' : ''} onClick={() => setAba('chats')}>💬 Chats{total > 0 ? ` (${total})` : ''}</button>
                    <button type="button" className={aba === 'voz' ? 'ativa' : ''} onClick={() => setAba('voz')}>🎙️ Sala da Party</button>
                </div>
                {onFechar && <button type="button" className="dock-com-fechar" onClick={onFechar} title="Fechar">✕</button>}
            </div>
            <div className="dock-com-corpo">
                {aba === 'chats'
                    ? <AbaChats chat={chat} candidatos={candidatos} naTaverna={naTaverna} />
                    : <AbaVoz voz={voz} estouNaCall={estouNaCall} naTaverna={naTaverna} alternarPresenca={alternarPresenca} meuNome={meuNome} compacto={!!onFechar} />}
            </div>
        </div>
    );
}

// Botão flutuante presente em TODAS as abas (menos na própria aba Comunicação).
export default function DockComunicacao() {
    const voz = useContext(VoiceContext);
    const chat = useContext(ChatContext);
    const meuNome = useStore(s => s.meuNome);
    const cenario = useStore(s => s.cenario);
    const abaAtiva = useStore(s => s.abaAtiva);
    const capturando = useBufferLigado();
    const [aberto, setAberto] = useState(false);

    if (!voz || !chat || abaAtiva === 'aba-comunicacao') return null;
    const estouNaCall = Array.isArray(cenario?.tavernaAtivos) && cenario.tavernaAtivos.includes(meuNome);
    const total = chat.totalNaoLidas;

    return (
        <div className="dock-com">
            {aberto && <PainelComunicacao className="dock-com-painel" onFechar={() => setAberto(false)} />}
            <button type="button" className={`dock-com-fab${estouNaCall ? ' na-call' : ''}${total > 0 ? ' tem-nova' : ''}`} onClick={() => setAberto(a => !a)} title="Chats e Sala da Party" aria-label="Abrir comunicação">
                {estouNaCall ? (voz.mutado ? '🔇' : '🎙️') : '💬'}
                {capturando && <span className="dock-com-rec" title="Gravador ligado: o app está sendo capturado (buffer de clipes ou gravação)">●</span>}
                {total > 0 && <span className="dock-com-badge fab">{total > 99 ? '99+' : total}</span>}
            </button>
        </div>
    );
}
