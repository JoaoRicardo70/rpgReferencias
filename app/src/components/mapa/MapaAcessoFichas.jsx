import React, { Suspense, useMemo, useState, useCallback } from 'react';
import useStore from '../../stores/useStore';
import { useMapaForm } from './MapaFormContext';
import lazyComRetry from '../layout/lazyComRetry';
import { listarFichasParaAcesso } from '../../core/acessoFichas';
import { atorDeValor } from '../../core/atorCombate';

// O livro pesa (Ficha Definitiva + Grimório): só carrega na primeira vez que alguém abre uma ficha.
const LivroEntidade = lazyComRetry(() => import('../mestre/LivroEntidade'));

// 📖 Livro da entidade aberto pelo Mapa. Montado uma vez, sempre (para o Mestre): o resumo do token e o painel
// "Fichas" só avisam o store (livroEntidadeMapa) e ele aparece aqui, num portal por cima do Mapa.
export function MapaLivroHost() {
    const isMestre = useStore(s => s.isMestre);
    const nome = useStore(s => s.livroEntidadeMapa);
    const setLivro = useStore(s => s.setLivroEntidadeMapa);
    const fechar = useCallback(() => setLivro(null), [setLivro]);
    if (!isMestre || !nome) return null;
    return (
        <Suspense fallback={null}>
            <LivroEntidade key={nome} nome={nome} aoFechar={fechar} />
        </Suspense>
    );
}

// 📖 Painel "Fichas" das ferramentas do Mestre: quem está na cena primeiro, depois NPCs e jogadores, com busca.
// 📖 Ficha abre o livro da entidade sem sair do Mapa; 🎭 Atuar passa a usar a ficha dela nos golpes do Mapa.
export function MapaPainelFichas() {
    const ctx = useMapaForm();
    const setLivro = useStore(s => s.setLivroEntidadeMapa);
    const setAtorCombate = useStore(s => s.setAtorCombate);
    const atorAtual = useStore(s => s.atorCombate);
    const [busca, setBusca] = useState('');
    const personagens = ctx ? ctx.personagens : null;
    const dummies = ctx ? ctx.dummies : null;
    const cenaRenderId = ctx ? ctx.cenaRenderId : null;

    const { naCena, npcs, jogadores } = useMemo(
        () => listarFichasParaAcesso({ personagens, dummies, cenaId: cenaRenderId, busca }),
        [personagens, dummies, cenaRenderId, busca]
    );
    const atuar = useCallback((valor) => setAtorCombate(atorDeValor(valor, dummies)), [setAtorCombate, dummies]);

    if (!ctx || !ctx.isMestre) return null;

    const ehAtor = (item) => {
        if (!atorAtual || !item.atorValor) return false;
        return atorAtual.dummieId ? item.atorValor === `d:${atorAtual.dummieId}` : item.atorValor === `n:${atorAtual.nome}`;
    };

    const linha = (item) => (
        <div key={item.chave} className="fichas-mapa-linha">
            <span className="fichas-mapa-nome">{item.rotulo}</span>
            <button type="button" className="btn-neon btn-blue fichas-mapa-btn" disabled={!item.nomeFicha} onClick={() => setLivro(item.nomeFicha)} title={item.nomeFicha ? `Abrir a ficha de ${item.nomeFicha}` : 'Este token não tem ficha'}>📖 Ficha</button>
            {item.atorValor && (
                <button type="button" className={`btn-neon fichas-mapa-btn ${ehAtor(item) ? 'btn-gold' : 'btn-green'}`} onClick={() => (ehAtor(item) ? setAtorCombate(null) : atuar(item.atorValor))} title="Seus golpes no Mapa passam a sair com a ficha dele">
                    {ehAtor(item) ? '🎭 Atuando' : '🎭 Atuar'}
                </button>
            )}
        </div>
    );

    const secao = (titulo, lista) => lista.length === 0 ? null : (
        <div className="fichas-mapa-secao">
            <div className="fichas-mapa-titulo">{titulo} <span className="gaveta-contador">{lista.length}</span></div>
            {lista.map(linha)}
        </div>
    );

    return (
        <div className="fade-in fichas-mapa">
            <h3 className="gaveta-titulo">📖 Fichas</h3>
            <input className="input-neon gaveta-busca" type="text" placeholder="🔍 Buscar ficha ou token..." value={busca} onChange={e => setBusca(e.target.value)} />
            {secao('📍 Na cena', naCena)}
            {secao('👹 NPCs', npcs)}
            {secao('🧑 Jogadores', jogadores)}
            {naCena.length + npcs.length + jogadores.length === 0 && <p className="gaveta-vazia">Nada encontrado.</p>}
        </div>
    );
}
