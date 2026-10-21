import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { carregarFichaDoFirebase, salvarFirebaseImediato } from '../../services/firebase-sync';
import { listarPersonagensParaTroca, registrarRecente, recentesValidos } from '../../core/trocaPersonagem';
import { iconeTipoPersonagem } from '../../core/tipoPersonagem';

const clonar = (o) => JSON.parse(JSON.stringify(o));

// 🎭 Troca rápida de personagem do MESTRE: um botão no topo abre a lista da mesa (NPCs primeiro, depois
// jogadores, com busca e "recentes") e um clique já passa a agir como aquela ficha — sem sair da tela
// nem digitar o nome. Grava a ficha atual ANTES de trocar, pra nada do que ele editou se perder.
const CHAVE_RECENTES = 'rpg_mestre_recentes';

function lerRecentes() {
    try {
        const r = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '[]');
        return Array.isArray(r) ? r : [];
    } catch (e) { return []; }
}

export default function TrocaRapidaMestre() {
    const isMestre = useStore(s => s.isMestre);
    const meuNome = useStore(s => s.meuNome);
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
    const caixaRef = useRef(null);

    const { npcs, jogadores } = useMemo(
        () => listarPersonagensParaTroca(personagens, meuNome, busca),
        [personagens, meuNome, busca]
    );
    const nomesRecentes = useMemo(
        () => (busca.trim() ? [] : recentesValidos(recentes, personagens, meuNome)),
        [recentes, personagens, meuNome, busca]
    );

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
        setTrocando(true);
        try {
            // 1. Grava o que o Mestre estava editando na ficha atual (sem debounce) antes de largar ela.
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
            const novos = registrarRecente(lerRecentes(), n);
            setRecentes(novos);
            try { localStorage.setItem(CHAVE_RECENTES, JSON.stringify(novos)); } catch (e) { /* sem localStorage */ }
            adicionarAviso(`Agora você está como ${n}.`, 'info');
            setAberto(false);
            setBusca('');
        } finally {
            setTrocando(false);
        }
    }, [meuNome, trocando, personagens, resetFicha, setMeuNome, carregarDadosFicha, setAtorCombate, adicionarAviso]);

    if (!isMestre) return null;

    const linha = (nome, ficha) => (
        <button key={nome} type="button" className="troca-rapida-item" disabled={trocando} onClick={() => trocarPara(nome)}>
            <span className="troca-rapida-icone">{iconeTipoPersonagem(ficha)}</span>
            <span className="troca-rapida-nome">{nome}</span>
        </button>
    );

    return (
        <div className="troca-rapida" ref={caixaRef}>
            <button type="button" className="troca-rapida-botao" onClick={() => setAberto(a => !a)} aria-expanded={aberto} title="Trocar rapidamente entre os personagens e NPCs da mesa">
                🎭 Controlar
            </button>
            {aberto && (
                <div className="troca-rapida-painel" role="dialog" aria-label="Trocar de personagem">
                    <input className="input-neon troca-rapida-busca" type="text" autoFocus placeholder="Buscar personagem ou NPC..." value={busca} onChange={e => setBusca(e.target.value)} />
                    <div className="troca-rapida-lista">
                        {nomesRecentes.length > 0 && (
                            <>
                                <div className="troca-rapida-secao">🕘 Recentes</div>
                                {nomesRecentes.map(n => linha(n, personagens[n]))}
                            </>
                        )}
                        {npcs.length > 0 && <div className="troca-rapida-secao">👹 NPCs</div>}
                        {npcs.map(p => linha(p.nome, p.ficha))}
                        {jogadores.length > 0 && <div className="troca-rapida-secao">🧑 Jogadores</div>}
                        {jogadores.map(p => linha(p.nome, p.ficha))}
                        {npcs.length === 0 && jogadores.length === 0 && <div className="troca-rapida-vazio">Nenhum personagem encontrado.</div>}
                    </div>
                </div>
            )}
        </div>
    );
}
