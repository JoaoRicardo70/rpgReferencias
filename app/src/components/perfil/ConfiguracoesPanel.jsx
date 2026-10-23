import React, { useState, useEffect, useCallback } from 'react';
import AparenciaPanel from './AparenciaPanel';
import { ACOES_ATALHO, getTodosAtalhos, salvarAtalho, restaurarAtalhos, eventoParaAtalho, formatarAtalho } from '../../core/atalhos';
import {
    lerConfig, salvarConfig, restaurarConfig, assinarConfig, aplicarConfigVisual, LIMITES_CONFIG,
    lerVolumeMusica, salvarVolumeMusica, assinarVolumeMusica
} from '../../core/configuracoes';
import { configurarFalaSexta } from '../../core/vozSexta';

const OPCOES_MODIFICADOR = ['Alt', 'Ctrl', 'Ctrl+Alt', 'Ctrl+Shift', 'Alt+Shift'];

function Controle({ rotulo, valor, onChange, min = 0, max = 100, sufixo = '%', dica }) {
    return (
        <label className="config-linha">
            <span className="config-rotulo">{rotulo}</span>
            <input type="range" min={min} max={max} step="1" value={valor} onChange={e => onChange(Number(e.target.value))} aria-label={rotulo} className="config-slider" />
            <span className="config-valor">{valor}{sufixo}</span>
            {dica && <span className="config-dica">{dica}</span>}
        </label>
    );
}

// 🔊 Volumes: música, vozes dos jogadores (por cima do volume de cada um) e a voz da Sexta-Feira.
function SecaoAudio({ config }) {
    const [musica, setMusica] = useState(() => lerVolumeMusica());
    useEffect(() => assinarVolumeMusica(setMusica), []);

    const testarSexta = useCallback(() => {
        try {
            if (typeof window === 'undefined' || !window.speechSynthesis || typeof window.SpeechSynthesisUtterance !== 'function') return;
            window.speechSynthesis.cancel();
            const fala = new window.SpeechSynthesisUtterance('Olá! Este é o volume da minha voz.');
            configurarFalaSexta(fala, window.speechSynthesis.getVoices?.() || [], lerConfig().volumeSexta / 100);
            window.speechSynthesis.speak(fala);
        } catch (e) { /* sem voz no navegador */ }
    }, []);

    return (
        <div className="def-box config-secao">
            <h3 className="config-titulo">🔊 Volume</h3>
            <Controle rotulo="Música (Jukebox)" valor={musica} onChange={v => setMusica(salvarVolumeMusica(v))} />
            <Controle rotulo="Vozes dos jogadores" valor={config.volumeVozes} onChange={v => salvarConfig({ volumeVozes: v })} dica="Vale por cima do volume de cada jogador (ajustado na Comunicação)." />
            <div className="config-linha-botao">
                <Controle rotulo="Voz da Sexta-Feira" valor={config.volumeSexta} onChange={v => salvarConfig({ volumeSexta: v })} />
                <button type="button" className="btn-neon config-botao" onClick={testarSexta}>🔊 Testar</button>
            </div>
        </div>
    );
}

// ⌨️ Teclas de atalho: clique em "Alterar" e aperte a nova combinação.
function SecaoAtalhos() {
    const [atalhos, setAtalhos] = useState(() => getTodosAtalhos());
    const [capturando, setCapturando] = useState(null);
    const [aviso, setAviso] = useState('');

    // Enquanto espera a nova combinação, ela não pode disparar nenhum outro atalho do app (captura antes de todo mundo).
    useEffect(() => {
        if (!capturando) return undefined;
        const aoTecla = (e) => {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (e.key === 'Escape') { setCapturando(null); setAviso(''); return; }
            const combo = eventoParaAtalho(e);
            if (!combo) return;
            const r = salvarAtalho(capturando, combo);
            if (r.ok) { setAtalhos(getTodosAtalhos()); setCapturando(null); setAviso(''); } else setAviso(r.motivo);
        };
        window.addEventListener('keydown', aoTecla, true);
        return () => window.removeEventListener('keydown', aoTecla, true);
    }, [capturando]);

    const mudarModificador = useCallback((id, valor) => {
        const r = salvarAtalho(id, valor);
        setAviso(r.ok ? '' : r.motivo);
        setAtalhos(getTodosAtalhos());
    }, []);

    const restaurar = useCallback(() => { restaurarAtalhos(); setAtalhos(getTodosAtalhos()); setCapturando(null); setAviso(''); }, []);

    return (
        <div className="def-box config-secao">
            <h3 className="config-titulo">⌨️ Teclas de atalho</h3>
            <ul className="config-atalhos">
                {ACOES_ATALHO.map(a => (
                    <li key={a.id} className="config-atalho">
                        <span className="config-atalho-nome">{a.nome}</span>
                        {a.tipo === 'modificador' ? (
                            <select className="input-neon config-atalho-select" value={atalhos[a.id]} onChange={e => mudarModificador(a.id, e.target.value)} aria-label={a.nome}>
                                {OPCOES_MODIFICADOR.map(m => <option key={m} value={m}>{formatarAtalho(m)} + 1 a 9</option>)}
                            </select>
                        ) : (
                            <button type="button" className={`btn-neon config-atalho-botao${capturando === a.id ? ' capturando' : ''}`} onClick={() => { setCapturando(capturando === a.id ? null : a.id); setAviso(''); }} aria-label={`Alterar o atalho: ${a.nome}`}>
                                {capturando === a.id ? 'Aperte a nova combinação... (Esc cancela)' : formatarAtalho(atalhos[a.id])}
                            </button>
                        )}
                    </li>
                ))}
            </ul>
            {aviso && <p className="config-aviso" role="alert">{aviso}</p>}
            <button type="button" className="btn-neon config-botao" onClick={restaurar}>↺ Restaurar atalhos padrão</button>
        </div>
    );
}

// 🖥️ Tela: tamanho da interface e animações reduzidas.
function SecaoTela({ config }) {
    const [min, max] = LIMITES_CONFIG.tamanhoInterface;
    return (
        <div className="def-box config-secao">
            <h3 className="config-titulo">🖥️ Tela</h3>
            <Controle rotulo="Tamanho da interface" valor={config.tamanhoInterface} min={min} max={max} onChange={v => salvarConfig({ tamanhoInterface: v })} dica="Aumenta ou diminui tudo: textos, botões e painéis." />
            <label className="config-linha config-linha-check">
                <input type="checkbox" checked={config.reduzirAnimacoes} onChange={e => salvarConfig({ reduzirAnimacoes: e.target.checked })} />
                <span className="config-rotulo">Reduzir animações</span>
                <span className="config-dica">Menos movimento na tela (ajuda em aparelhos lentos e para quem se incomoda com movimento).</span>
            </label>
        </div>
    );
}

export default function ConfiguracoesPanel({ className }) {
    const [config, setConfig] = useState(() => lerConfig());
    useEffect(() => assinarConfig(c => { setConfig(c); aplicarConfigVisual(c); }), []);

    const restaurarTudo = useCallback(() => {
        if (typeof window !== 'undefined' && !window.confirm('Voltar volumes, tamanho da interface, animações e atalhos ao padrão? O estilo visual, a navegação e as cores do dado não mudam.')) return;
        restaurarConfig();
        restaurarAtalhos();
        salvarVolumeMusica(60);
        window.dispatchEvent(new Event('rpg-config-restaurada'));
    }, []);

    // Os atalhos são lidos direto do aparelho; ao restaurar tudo, a seção de atalhos remonta pela chave.
    const [versao, setVersao] = useState(0);
    useEffect(() => {
        const aoRestaurar = () => setVersao(v => v + 1);
        window.addEventListener('rpg-config-restaurada', aoRestaurar);
        return () => window.removeEventListener('rpg-config-restaurada', aoRestaurar);
    }, []);

    return (
        <div className={['config-panel', className].filter(Boolean).join(' ')}>
            <h2 className="config-cabecalho">⚙️ Configurações</h2>
            <p className="config-nota">Tudo aqui vale só para este aparelho: cada jogador ajusta o seu sem mudar a tela dos outros.</p>
            <SecaoAudio key={`a${versao}`} config={config} />
            <SecaoAtalhos key={`k${versao}`} />
            <SecaoTela config={config} />
            <AparenciaPanel />
            <div className="config-rodape">
                <button type="button" className="btn-neon btn-red config-botao" onClick={restaurarTudo}>↺ Restaurar configurações</button>
            </div>
        </div>
    );
}
