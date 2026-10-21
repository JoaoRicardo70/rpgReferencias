import { useEffect, useRef } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { getIdentificacoes, montarTextoIdentificacao } from '../../core/identificacao';

// 🔍 Quando um ataque NOVO (Dano no feed) tem VOCÊ como alvo e você tem uma técnica com o efeito "identificar tipo do ataque"
// e/ou "identificar energia" (core/identificacao.js), avisa na tela o que você percebeu. Só olha entradas novas (com `ts` de depois
// de montar, com folga pro relógio das máquinas), assim o histórico do feed reenviado ao entrar na mesa não gera aviso.
const FOLGA_RELOGIO_MS = 5 * 1000;

function sou(alvo, eu) {
    return !!alvo && sanitizarNome(String(alvo)) === eu;
}

export default function IdentificacaoAtaque() {
    const feed = useStore(s => s.feedCombate);
    const meuNome = useStore(s => s.meuNome);
    const minhaFicha = useStore(s => s.minhaFicha);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const vistos = useRef(new Set());
    const montadoEm = useRef(Date.now());

    useEffect(() => {
        if (!meuNome || !Array.isArray(feed)) return;
        const eu = sanitizarNome(meuNome);
        for (const f of feed) {
            if (!f || f.tipo !== 'dano' || !f.ts || f.nome === meuNome) continue;
            const chave = `${f.ts}|${f.nome}`;
            if (vistos.current.has(chave)) continue;
            vistos.current.add(chave);
            if (f.ts < montadoEm.current - FOLGA_RELOGIO_MS) continue;

            const alvos = Array.isArray(f.alvosAplicados) ? f.alvosAplicados : [];
            if (!sou(f.alvoNome, eu) && !alvos.some(a => sou(a, eu))) continue;

            const texto = montarTextoIdentificacao(f.nome, f.tipoAtaque, f.energiasUsadas, getIdentificacoes(minhaFicha));
            if (texto) adicionarAviso(texto, 'info');
        }
    }, [feed, meuNome, minhaFicha, adicionarAviso]);

    return null;
}
