import React, { useCallback, useContext, useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import { VoiceContext } from '../../hooks/VoiceContext';
import { ChatContext } from '../../hooks/ChatContext';
import { salvarCenarioCompleto } from '../../services/firebase-sync';
import { alternarPresencaNaTaverna } from '../../core/chats';
import { AbaChats, AbaVoz } from './DockComunicacao';
import Jukebox from '../jukebox/Jukebox';
import GravadorPanel from '../ia/GravadorPanel';

const SECOES = [
    { id: 'chats', icone: '💬', nome: 'Chats' },
    { id: 'voz', icone: '🎙️', nome: 'Sala da Party' },
    { id: 'musica', icone: '🎵', nome: 'Mesa de Som' },
    { id: 'gravador', icone: '🎬', nome: 'Gravador' },
];

// Aba dedicada: Chats, Sala da Party, Mesa de Som e Gravador juntos num só lugar — dá para tocar
// música, falar na call e gravar a sessão sem trocar de aba. O TabPanel do App já esconde tudo por
// CSS quando esta aba não está ativa (nunca desmonta). Aqui dentro, Mesa de Som e Gravador têm
// estado próprio (o player do YouTube, o MediaRecorder) e por isso ficam SEMPRE montados, trocando
// de seção só por CSS — senão a música pararia e uma gravação em andamento seria cortada toda vez
// que você olhasse para outra seção. Já os Chats só montam com a aba ativa e a seção escolhida:
// assim uma mensagem nova não conta como lida sem você realmente ter aberto a conversa.
export default function ComunicacaoPanel() {
    const abaAtiva = useStore(s => s.abaAtiva);
    const voz = useContext(VoiceContext);
    const chat = useContext(ChatContext);
    const meuNome = useStore(s => s.meuNome);
    const cenario = useStore(s => s.cenario);
    const personagens = useStore(s => s.personagens);
    const [secao, setSecao] = useState('chats');

    const naTaverna = useMemo(() => (Array.isArray(cenario?.tavernaAtivos) ? cenario.tavernaAtivos : []), [cenario]);
    const estouNaCall = naTaverna.includes(meuNome);
    const candidatos = useMemo(() => Object.keys(personagens || {}).filter(n => n && n !== meuNome).sort((a, b) => a.localeCompare(b)), [personagens, meuNome]);

    const alternarPresenca = useCallback(() => {
        salvarCenarioCompleto(alternarPresencaNaTaverna(cenario, meuNome));
    }, [cenario, meuNome]);

    const temProvedores = !!(voz && chat);
    const abaVisivel = abaAtiva === 'aba-comunicacao';
    const total = chat ? chat.totalNaoLidas : 0;

    return (
        <div className="comunicacao-aba" role="region" aria-label="Comunicação">
            <h2 className="comunicacao-aba-titulo">💬 Comunicação, Voz e Mesa de Som</h2>
            <div className="painel-com painel-com-aba">
                <div className="dock-com-cabecalho">
                    <div className="dock-com-abas">
                        {SECOES.map(s => (
                            <button
                                key={s.id} type="button" className={secao === s.id ? 'ativa' : ''}
                                onClick={() => setSecao(s.id)}
                            >
                                {s.icone} {s.nome}{s.id === 'chats' && total > 0 ? ` (${total})` : ''}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="dock-com-corpo">
                    {abaVisivel && secao === 'chats' && temProvedores && (
                        <AbaChats chat={chat} candidatos={candidatos} naTaverna={naTaverna} />
                    )}
                    {abaVisivel && secao === 'voz' && temProvedores && (
                        <AbaVoz
                            voz={voz} estouNaCall={estouNaCall} naTaverna={naTaverna}
                            alternarPresenca={alternarPresenca} meuNome={meuNome} compacto={false}
                        />
                    )}
                    <div className="comunicacao-aba-secao" style={{ display: secao === 'musica' ? 'block' : 'none' }}>
                        <Jukebox />
                    </div>
                    <div className="comunicacao-aba-secao" style={{ display: secao === 'gravador' ? 'block' : 'none' }}>
                        <GravadorPanel />
                    </div>
                </div>
            </div>
        </div>
    );
}
