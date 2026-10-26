import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import useStore, { fichaPadrao } from '../../stores/useStore';
import {
    iniciarListenerMidia, enviarImagemMidia, apagarImagemMidia, limparMidia, marcarImagemUsada, criarPersonagemNaMesa, personagemExiste
} from '../../services/midia-sync';
import { MENSAGEM_IMAGEM_INVALIDA, descreverErroMidia, ehImagemValida, montarFichaNpcDeImagem, nomeDeNpcValido, podeApagarMidia } from '../../core/midia';
import { formatarHoraMensagem } from '../../core/chats';

const clonar = (o) => JSON.parse(JSON.stringify(o));

// Imagem ampliada. O Mestre pode transformá-la numa ficha de NPC (a imagem vira o avatar) sem sair da Sala da Party.
function VisualizadorDeImagem({ imagem, ehMestre, personagens, onFechar, onNpcCriado }) {
    const [criando, setCriando] = useState(false);
    const [nome, setNome] = useState('');
    const [erro, setErro] = useState('');
    const [ocupado, setOcupado] = useState(false);

    useEffect(() => {
        const tecla = (e) => { if (e.key === 'Escape') onFechar(); };
        document.addEventListener('keydown', tecla);
        return () => document.removeEventListener('keydown', tecla);
    }, [onFechar]);

    const criar = async (e) => {
        e.preventDefault();
        const v = nomeDeNpcValido(nome, Object.keys(personagens || {}));
        if (!v.ok) { setErro(v.motivo); return; }
        setOcupado(true);
        try {
            // Nome que vira a mesma chave de um personagem que o store ainda não carregou: confere no banco antes de criar.
            if (await personagemExiste(v.nome)) { setErro('Já existe um personagem com esse nome.'); return; }
            const ficha = montarFichaNpcDeImagem(clonar(fichaPadrao), v.nome, imagem.url);
            // A imagem é marcada ANTES: assim o "Limpar" nunca apaga o arquivo que virou avatar, mesmo se algo falhar depois.
            await marcarImagemUsada(imagem.id);
            if (await criarPersonagemNaMesa(v.nome, ficha)) { onNpcCriado(v.nome); onFechar(); return; }
            setErro('Não foi possível criar o NPC. Verifique a conexão.');
        } catch (e2) {
            setErro('Não foi possível criar o NPC. Verifique a conexão.');
        } finally {
            setOcupado(false);
        }
    };

    return createPortal(
        <div className="midia-visualizador" role="dialog" aria-label="Imagem ampliada" onClick={onFechar}>
            <div className="midia-visualizador-caixa" onClick={(e) => e.stopPropagation()}>
                <button type="button" className="midia-visualizador-fechar" onClick={onFechar} aria-label="Fechar">✕</button>
                <img className="midia-visualizador-img" src={imagem.url} alt={`Imagem enviada por ${imagem.autor}`} />
                <div className="midia-visualizador-rodape">
                    <span>🖼️ {imagem.autor}{imagem.ts ? ` · ${formatarHoraMensagem(imagem.ts)}` : ''}</span>
                    {ehMestre && !criando && (
                        <button type="button" className="btn-neon btn-purple midia-criar-npc" onClick={() => setCriando(true)}>🎭 Criar NPC com esta imagem</button>
                    )}
                </div>
                {ehMestre && criando && (
                    <form className="midia-npc-form" onSubmit={criar}>
                        <input className="input-neon" autoFocus value={nome} maxLength={50} onChange={e => { setNome(e.target.value); setErro(''); }} placeholder="Nome do NPC" aria-label="Nome do NPC" />
                        <button type="submit" className="btn-neon btn-green" disabled={ocupado || !nome.trim()}>{ocupado ? 'Criando...' : 'Criar NPC'}</button>
                        <button type="button" className="btn-neon btn-red" onClick={() => { setCriando(false); setErro(''); }} disabled={ocupado}>Cancelar</button>
                        {erro && <div className="midia-erro" role="alert">{erro}</div>}
                    </form>
                )}
            </div>
        </div>,
        document.body
    );
}

// Chat de mídia da Sala da Party: qualquer um envia imagens (arrastar, colar ou escolher o arquivo); clicar amplia.
// Só Mestre/Co-Mestre limpa o chat inteiro (libera espaço no armazenamento) e cria NPC a partir de uma imagem.
export default function PainelMidia({ onFechar }) {
    const meuNome = useStore(s => s.meuNome);
    const isMestre = useStore(s => s.isMestre);
    const personagens = useStore(s => s.personagens);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const [imagens, setImagens] = useState([]);
    const [carregando, setCarregando] = useState(true);
    const [enviando, setEnviando] = useState(false);
    const [erro, setErro] = useState('');
    const [aberta, setAberta] = useState(null);
    const [arrastando, setArrastando] = useState(false);
    const fimRef = useRef(null);

    useEffect(() => {
        const cancela = iniciarListenerMidia(
            (lista) => { setImagens(lista); setCarregando(false); },
            (e) => { setErro(descreverErroMidia(e)); setCarregando(false); }
        );
        return () => { if (typeof cancela === 'function') cancela(); };
    }, []);

    const ultimoId = imagens.length ? imagens[imagens.length - 1].id : '';
    useEffect(() => {
        if (fimRef.current && fimRef.current.scrollIntoView) fimRef.current.scrollIntoView({ block: 'end' });
    }, [ultimoId]);

    const enviar = useCallback(async (arquivo) => {
        if (!arquivo) return;
        if (!ehImagemValida(arquivo)) { setErro(MENSAGEM_IMAGEM_INVALIDA); return; }
        setEnviando(true);
        setErro('');
        const r = await enviarImagemMidia(arquivo, meuNome);
        setEnviando(false);
        if (!r.ok) setErro(descreverErroMidia(r.erro));
    }, [meuNome]);

    const aoEscolher = (e) => { enviar(e.target.files && e.target.files[0]); e.target.value = ''; };
    const aoColar = (e) => {
        const item = Array.from((e.clipboardData && e.clipboardData.items) || []).find(i => i.type && i.type.startsWith('image/'));
        if (item) { e.preventDefault(); enviar(item.getAsFile()); }
    };
    const aoSoltar = (e) => {
        e.preventDefault();
        setArrastando(false);
        enviar(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
    };

    const apagar = async (imagem) => {
        if (!window.confirm('Apagar esta imagem do chat de mídia?')) return;
        if (!(await apagarImagemMidia(imagem))) setErro('Não foi possível apagar a imagem.');
    };
    const limpar = async () => {
        if (!window.confirm('Limpar o chat de mídia? TODAS as imagens serão apagadas para todos (o espaço no armazenamento é liberado).')) return;
        const r = await limparMidia();
        if (!r.ok) setErro('Não foi possível limpar o chat de mídia.');
        else adicionarAviso(`Chat de mídia limpo (${r.apagadas} ${r.apagadas === 1 ? 'imagem apagada' : 'imagens apagadas'}${r.mantidas ? `; ${r.mantidas} mantido(s) por já serem avatar de NPC` : ''}).`, 'info');
    };

    return (
        <aside
            className={`sala-party-midia${arrastando ? ' arrastando' : ''}`} aria-label="Chat de mídia" tabIndex={-1}
            onPaste={aoColar} onDragOver={(e) => { e.preventDefault(); setArrastando(true); }} onDragLeave={() => setArrastando(false)} onDrop={aoSoltar}
        >
            <div className="sala-party-painel-topo sala-party-midia-topo">
                <span>🖼️ Mídia</span>
                <span className="sala-party-painel-acoes">
                    {isMestre && <button type="button" className="midia-limpar" onClick={limpar} title="Apagar todas as imagens do chat (libera espaço no armazenamento)">🧹 Limpar</button>}
                    {onFechar && <button type="button" className="sala-party-feed-fechar" onClick={onFechar} title="Ocultar o chat de mídia" aria-label="Ocultar o chat de mídia">✕</button>}
                </span>
            </div>
            <div className="midia-lista">
                {carregando && <div className="dock-com-vazio">Carregando...</div>}
                {!carregando && imagens.length === 0 && <div className="dock-com-vazio">Nenhuma imagem ainda. Envie, arraste ou cole (Ctrl+V) uma imagem aqui.</div>}
                {imagens.map(img => (
                    <figure key={img.id} className="midia-item">
                        <button type="button" className="midia-item-imagem" onClick={() => setAberta(img)} title="Ampliar">
                            <img src={img.url} alt={`Enviada por ${img.autor}`} loading="lazy" />
                        </button>
                        <figcaption>
                            <span><strong>{img.autor === meuNome ? 'Você' : img.autor}</strong> <small>{img.ts ? formatarHoraMensagem(img.ts) : ''}</small></span>
                            {podeApagarMidia(img, { ehMestre: isMestre, meuNome }) && (
                                <button type="button" className="midia-apagar" onClick={() => apagar(img)} title="Apagar esta imagem" aria-label="Apagar esta imagem">🗑️</button>
                            )}
                        </figcaption>
                    </figure>
                ))}
                <div ref={fimRef} />
            </div>
            {erro && <div className="midia-erro" role="alert">{erro}</div>}
            <label className={`midia-enviar btn-neon btn-blue${enviando ? ' ocupado' : ''}`}>
                {enviando ? 'Enviando...' : '➕ Enviar imagem'}
                <input type="file" accept="image/*" onChange={aoEscolher} disabled={enviando} hidden />
            </label>
            {aberta && (
                <VisualizadorDeImagem
                    imagem={aberta} ehMestre={isMestre} personagens={personagens} onFechar={() => setAberta(null)}
                    onNpcCriado={(n) => adicionarAviso(`NPC ${n} criado a partir da imagem. Ele já está na sua lista de NPCs.`, 'info')}
                />
            )}
        </aside>
    );
}
