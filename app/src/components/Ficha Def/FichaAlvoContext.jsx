import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { iniciarSincronizacaoFichaAlvo, pararSincronizacaoFichaAlvo, salvarFichaAlvoSilencioso, salvarFichaSilencioso } from '../../services/firebase-sync';

// 🔥 GRIMÓRIO DA ENTIDADE: envolve a Ficha Definitiva (Marcados.jsx) e seus painéis (Classificação/
// Relicário/Pactos/Domínios) pra que TODOS os campos leiam e gravem na ficha de UMA ENTIDADE
// ESCOLHIDA em vez de sempre "meu personagem" -- usado pelo Mestre (PainelMestreSandbox.jsx) pra
// ver/editar a Ficha Definitiva completa de QUALQUER personagem da mesa, ao vivo, com o MESMO
// componente que o próprio jogador usa. Sem Provider (ou mirando o próprio nome do jogador
// logado), o comportamento é idêntico ao de sempre -- useFichaAtiva() cai pra minhaFicha/
// updateFicha da store.
const FichaAlvoContext = createContext(null);

export function FichaAlvoProvider({ nome, children }) {
    const meuNome = useStore(s => s.meuNome);
    const souEuMesmo = !nome || sanitizarNome(nome) === sanitizarNome(meuNome || '');

    // Inicia/encerra o rastreamento de baseline (diff de save + merge do listener da mesa,
    // firebase-sync.js) só enquanto este Provider mira uma entidade que não é "eu mesmo" --
    // editar a própria ficha continua 100% pelo caminho de sempre (minhaFicha).
    useEffect(() => {
        if (souEuMesmo) return undefined;
        iniciarSincronizacaoFichaAlvo(nome);
        return () => pararSincronizacaoFichaAlvo(nome);
        // eslint-disable-next-line react-hooks/exhaustive-deps -- só reinicia quando o alvo muda de fato
    }, [nome, souEuMesmo]);

    const value = useMemo(() => ({ nome, souEuMesmo }), [nome, souEuMesmo]);
    return <FichaAlvoContext.Provider value={value}>{children}</FichaAlvoContext.Provider>;
}

// Só o "quem é o alvo" (raramente muda) -- widgets universais (CampoMagico/LabelMagico em
// Marcados.jsx) usam isto em vez de useFichaAtiva() pra não assinar minhaFicha/personagens
// inteiros e re-renderizar a cada tecla digitada em QUALQUER campo da ficha.
export function useFichaAlvoContexto() {
    return useContext(FichaAlvoContext);
}

// Ficha + updateFicha ativos: a de outra entidade (dentro de um FichaAlvoProvider mirando alguém
// que não sou eu) ou, por padrão (fora de qualquer Provider, ou mirando eu mesmo), a minha
// própria -- byte a byte o mesmo comportamento de sempre pro jogador comum.
export function useFichaAtiva() {
    const alvo = useContext(FichaAlvoContext);
    const usandoAlvo = !!alvo && !alvo.souEuMesmo;

    const minhaFicha = useStore(s => s.minhaFicha);
    const meuNome = useStore(s => s.meuNome);
    const fichaAlvo = useStore(s => (usandoAlvo ? s.personagens?.[alvo.nome] : undefined));
    const updateFichaAction = useStore(s => s.updateFicha);
    const updateFichaAlvoAction = useStore(s => s.updateFichaAlvo);

    const ficha = usandoAlvo ? fichaAlvo : minhaFicha;
    const nome = usandoAlvo ? alvo.nome : meuNome;

    const updateFicha = useMemo(() => {
        if (usandoAlvo) return (callback) => updateFichaAlvoAction(alvo.nome, callback);
        return updateFichaAction;
    }, [usandoAlvo, alvo?.nome, updateFichaAlvoAction, updateFichaAction]);

    return { ficha, updateFicha, nome, souEuMesmo: !usandoAlvo };
}

// Só a função de salvar (debounced), sem assinar minhaFicha/personagens -- usado pelos widgets
// universais da Ficha Definitiva (CampoMagico/LabelMagico em Marcados.jsx), que são renderizados
// dezenas de vezes por página. Como só depende de "qual é o alvo" (que raramente muda), esses
// widgets não re-renderizam a cada tecla digitada em QUALQUER OUTRO campo da ficha -- ao
// contrário do que aconteceria se eles chamassem useFichaAtiva() (que assina minhaFicha inteira).
export function useCallSaveAtivo() {
    const alvo = useContext(FichaAlvoContext);
    const usandoAlvo = !!alvo && !alvo.souEuMesmo;
    return useCallback(() => {
        if (usandoAlvo) salvarFichaAlvoSilencioso(alvo.nome);
        else salvarFichaSilencioso();
    }, [usandoAlvo, alvo?.nome]);
}
