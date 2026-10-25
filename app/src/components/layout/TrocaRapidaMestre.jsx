import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { carregarFichaDoFirebase, salvarFirebaseImediato, salvarCamposPersonagem } from '../../services/firebase-sync';
import {
    listarPersonagensParaTroca, registrarRecente, recentesValidos,
    nomesComAcessoAoNpc, npcsLiberadosParaJogador, alternarNomeNaLista, jogadoresDaMesa
} from '../../core/trocaPersonagem';
import { iconeTipoPersonagem, ehNpc } from '../../core/tipoPersonagem';

const clonar = (o) => JSON.parse(JSON.stringify(o));

// 🎭 Troca rápida de personagem. MESTRE: um botão no topo abre a lista da mesa (NPCs primeiro, depois jogadores, com busca e
// "recentes") e um clique já passa a agir como aquela ficha — sem sair da tela nem digitar o nome; cada NPC tem o 👥 pra
// liberar o acesso a jogadores específicos (casos especiais: um NPC colado no personagem do jogador, um pet...).
// JOGADOR: só aparece se o Mestre liberou algum NPC pra ele (ou se ele está agindo como um NPC): lista os NPCs liberados e o
// caminho de volta pro personagem dele. Grava a ficha atual ANTES de trocar, pra nada do que se editou se perder.
const CHAVE_RECENTES = 'rpg_mestre_recentes';
const CHAVE_BASE = 'rpg_personagem_base';

function lerRecentes() {
    try {
        const r = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]');
        return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
}

function lerBase() {
    try { return localStorage.getItem(CHAVE_BASE) || ''; } catch (e) { return ''; }
}

export default function TrocaRapidaMestre() {
    const isMestre = useStore(s => s.isMestre);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const personagens = useStore(s => s.personagens);
    const setMeuNome = useStore(s => s.setMeuNome);
    const resetFicha = useStore(s => s.resetFicha);
    const carregarDadosFicha = useStore(s => s.carregarDadosFicha);
    const setAtorCombate = useStore(s => s.setAtorCombate);
    const adicionarAviso = useStore(s => s.adicionarAviso);

    const [aberto, setAberto] = useState(false);
    const [busca, setBusca] = useState('');
    const [trocando, setTrocando] = useState(false);
    const [recentes, setRecentes] = useState(lerRecentes);
    const [editandoAcesso, setEditandoAcesso] = useState('');
    const caixaRef = useRef(null);

    const { npcs, jogadores } = useMemo(
        () => listarPersonagensParaTroca(personagens, meuNome, busca),
        [personagens, meuNome, busca]
    );
    const nomesRecentes = useMemo(
        () => (busca.trim() ? [] : recentesValidos(recentes, personagens, meuNome)),
        [recentes, personagens, meuNome, busca]
    );
    const liberados = useMemo(() => (isMestre ? [] : npcsLiberadosParaJogador(personagens, meuNome).filter(p => p.nome !== meuNome)), [isMestre, personagens, meuNome]);
    const agindoComoNpc = ehNpc(minhaFicha);
    const nomeBase = !isMestre ? lerBase() : '';
    const podeVoltar = !isMestre && agindoComoNpc && !!nomeBase && nomeBase !== meuNome && !!(personagens && personagens[nomeBase]);
    const nomesDeJogadores = useMemo(() => jogadoresDaMesa(personagens), [personagens]);

    // Fecha ao clicar fora ou apertar Esc.
    useEffect(() => {
        if (!aberto) return undefined;
        const fora = (e) => { if (caixaRef.current && !caixaRef.current.contains(e.target)) setAberto(false); };
        const tecla = (e) => { if (e.key === 'Escape') setAberto(false); };
        document.addEventListener('mousedown', fora);
        document.addEventListener('keydown', tecla);
        return () => {
            document.removeEventListener('mousedown', fora);
            document.removeEventListener('keydown', tecla);
        };
    }, [aberto]);

    const trocarPara = useCallback(async (nome) => {
        const n = sanitizarNome(nome);
        if (!n || n === useStore.getState().meuNome || trocando) return;
        if (!useStore.getState().isMestre && !liberados.some(p => sanitizarNome(p.nome) === n) && n !== sanitizarNome(lerBase())) return;
        setTrocando(true);
        try {
            // 1. Grava o que estava sendo editado na ficha atual (sem debounce) antes de largar ela.
            try { await salvarFirebaseImediato(); } catch (e) { /* sem rede: a cópia local já foi feita */ }
            // 2. Busca a ficha mais nova (cai pro snapshot da mesa, depois pra cópia local).
            let dados = await carregarFichaDoFirebase(n);
            if (!(dados && Object.keys(dados).length > 2)) dados = personagens ? personagens[n] : null;
            if (!(dados && Object.keys(dados).length > 2)) {
                try { dados = JSON.parse(localStorage.getItem('rpgFicha_' + n) || 'null'); } catch (e) { dados = null; }
            }
            if (!(dados && Object.keys(dados).length > 2)) {
                adicionarAviso(`Não consegui abrir a ficha de ${n}.`, 'alerta');
                return;
            }
            // 3. Passa a ser esse personagem (mesmo fluxo do "Trocar", mas sem voltar à tela de escolha).
            //    Regrava a ficha atual logo antes (pega edições feitas durante a espera) e só então troca.
            const nomeAnterior = useStore.getState().meuNome;
            try { await salvarFirebaseImediato(); } catch (e) { /* sem rede */ }
            if (useStore.getState().meuNome !== nomeAnterior) return;
            const fichaAnterior = clonar(useStore.getState().minhaFicha);
            try {
                resetFicha();
                setMeuNome(n);
                carregarDadosFicha(clonar(dados));
            } catch (e) {
                // Falhou no meio: volta pro personagem anterior em vez de ficar com uma ficha vazia sob o nome novo.
                setMeuNome(nomeAnterior);
                carregarDadosFicha(fichaAnterior);
                adicionarAviso(`Não consegui trocar para ${n}.`, 'alerta');
                return;
            }
            setAtorCombate(null);
            try { localStorage.setItem('rpgNome', n); } catch (e) { /* sem localStorage */ }
            if (useStore.getState().isMestre) {
                const novos = registrarRecente(lerRecentes(), n);
                setRecentes(novos);
                try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(novos)); } catch (e) { /* sem localStorage */ }
            } else if (!ehNpc(fichaAnterior)) {
                // Jogador indo agir como um NPC liberado: guarda o personagem dele pra poder voltar.
                try { localStorage.setItem(CHAVE_BASE, nomeAnterior); } catch (e) { /* sem localStorage */ }
            }
            adicionarAviso(`Agora você está como ${n}.`, 'info');
            setAberto(false);
            setBusca('');
        } finally {
            setTrocando(false);
        }
    }, [meuNome, trocando, liberados, personagens, resetFicha, setMeuNome, carregarDadosFicha, setAtorCombate, adicionarAviso]);

    const alternarAcesso = useCallback((nomeNpc, jogador) => {
        const lista = alternarNomeNaLista(nomesComAcessoAoNpc(personagens && personagens[nomeNpc]), jogador);
        // Lista vazia = ninguém além do Mestre (apaga o campo).
        salvarCamposPersonagem(nomeNpc, { acessoJogadores: lista.length ? lista : null });
    }, [personagens]);

    if (!isMestre && liberados.length === 0 && !podeVoltar) return null;

    const linha = (nome, ficha, { acesso = false } = {}) => {
        const botao = (
            <button key={nome} type="button" className="troca-rapida-item" disabled={trocando} onClick={() => trocarPara(nome)}>
                <span className="troca-rapida-icone">{iconeTipoPersonagem(ficha)}</span>
                <span className="troca-rapida-nome">{nome}</span>
            </button>
        );
        if (!acesso) return botao;
        const comAcesso = nomesComAcessoAoNpc(ficha);
        return (
            <div key={nome} className="troca-rapida-linha">
                {botao}
                <button type="button" className={`troca-rapida-acesso${comAcesso.length ? ' ativo' : ''}`} aria-expanded={editandoAcesso === nome} title="Liberar este NPC para jogadores específicos" aria-label={`Acesso de jogadores a ${nome}`} onClick={() => setEditandoAcesso(editandoAcesso === nome ? '' : nome)}>
                    👥{comAcesso.length ? ` ${comAcesso.length}` : ''}
                </button>
                {editandoAcesso === nome && (
                    <div className="troca-rapida-acesso-painel">
                        <small>Jogadores que também podem agir como {nome}:</small>
                        {nomesDeJogadores.length === 0 && <div className="troca-rapida-vazio">Nenhum jogador na mesa.</div>}
                        {nomesDeJogadores.map(j => (
                            <label key={j} className="troca-rapida-acesso-opcao">
                                <input type="checkbox" checked={comAcesso.includes(sanitizarNome(j))} onChange={() => alternarAcesso(nome, sanitizarNome(j))} /> {j}
                            </label>
                        ))}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="troca-rapida" ref={caixaRef}>
            <button type="button" className="troca-rapida-botao" onClick={() => setAberto(a => !a)} aria-expanded={aberto} title={isMestre ? 'Trocar rapidamente entre os personagens e NPCs da mesa' : 'Agir como um NPC que o Mestre liberou para você'}>
                🎭 Controlar
            </button>
            {aberto && (
                <div className="troca-rapida-painel" role="dialog" aria-label="Trocar de personagem">
                    {isMestre ? (
                        <>
                            <input className="input-neon troca-rapida-busca" type="text" autoFocus placeholder="Buscar personagem ou NPC..." value={busca} onChange={e => setBusca(e.target.value)} />
                            <div className="troca-rapida-lista">
                                {nomesRecentes.length > 0 && (
                                    <>
                                        <div className="troca-rapida-secao">🕘 Recentes</div>
                                        {nomesRecentes.map(n => linha(n, personagens[n]))}
                                    </>
                                )}
                                {npcs.length > 0 && <div className="troca-rapida-secao">👹 NPCs</div>}
                                {npcs.map(p => linha(p.nome, p.ficha, { acesso: true }))}
                                {jogadores.length > 0 && <div className="troca-rapida-secao">🧑 Jogadores</div>}
                                {jogadores.map(p => linha(p.nome, p.ficha))}
                                {npcs.length === 0 && jogadores.length === 0 && <div className="troca-rapida-vazio">Nenhum personagem encontrado.</div>}
                            </div>
                        </>
                    ) : (
                        <div className="troca-rapida-lista">
                            {podeVoltar && (
                                <>
                                    <div className="troca-rapida-secao">↩ Meu personagem</div>
                                    {linha(nomeBase, personagens[nomeBase])}
                                </>
                            )}
                            {liberados.length > 0 && <div className="troca-rapida-secao">🤝 NPCs liberados pelo Mestre</div>}
                            {liberados.map(p => linha(p.nome, p.ficha))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
