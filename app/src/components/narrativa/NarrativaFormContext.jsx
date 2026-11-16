import { racaIdAposEdicaoDeTexto, composicaoComPrincipal } from '../../core/racas';
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';

export const ATRIBUTO_OPTIONS = [
    'forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao',
    'vida', 'mana', 'aura', 'chakra', 'corpo', 'todos_status', 'todas_energias', 'geral', 'dano'
];

export const PROPRIEDADE_OPTIONS = [
    'base', 'mbase', 'mgeral', 'mformas', 'mabs', 'munico', 'reducaocusto', 'regeneracao'
];

const NarrativaFormContext = createContext(null);

export function useNarrativaForm() {
    const ctx = useContext(NarrativaFormContext);
    if (!ctx) return null;
    return ctx;
}

export function NarrativaFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);

    const [raca, setRaca] = useState('');
    const [classe, setClasse] = useState('');
    const [idade, setIdade] = useState('');
    const [fisico, setFisico] = useState('');
    const [sangue, setSangue] = useState('');
    const [alinhamento, setAlinhamento] = useState('');
    const [afiliacao, setAfiliacao] = useState('');
    const [dinheiro, setDinheiro] = useState('');

    const [passivaNome, setPassivaNome] = useState('');
    const [passivaTipo, setPassivaTipo] = useState('Vantagem');
    const [efeitosTempPassiva, setEfeitosTempPassiva] = useState([]);
    const [nomeEfeito, setNomeEfeito] = useState('');
    const [novoAtr, setNovoAtr] = useState('forca');
    const [novoProp, setNovoProp] = useState('base');
    const [novoVal, setNovoVal] = useState('');
    const [editIndex, setEditIndex] = useState(-1);

    const [salvando, setSalvando] = useState(false);

    const carregarBio = useCallback(() => {
        const bio = minhaFicha?.bio || {};
        setRaca(bio.raca || '');
        setClasse(bio.classe || '');
        setIdade(bio.idade || '');
        setFisico(bio.fisico || '');
        setSangue(bio.sangue || '');
        setAlinhamento(bio.alinhamento || '');
        setAfiliacao(bio.afiliacao || '');
        setDinheiro(bio.dinheiro || '');
    }, [minhaFicha?.bio]);

    useEffect(() => { carregarBio(); }, [carregarBio]);

    const salvarBio = useCallback(() => {
        updateFicha((ficha) => {
            if (!ficha.bio) ficha.bio = {};
            ficha.bio.racaId = racaIdAposEdicaoDeTexto(useStore.getState().cenario, ficha.bio.racaId, ficha.bio.raca, raca);
            ficha.bio.raca = raca; { const stRaca = useStore.getState(); const comp = stRaca.isMestre ? composicaoComPrincipal(stRaca.cenario, ficha) : null; if (comp) ficha.bio.composicaoRacial = comp; } ficha.bio.classe = classe; ficha.bio.idade = idade;
            ficha.bio.fisico = fisico; ficha.bio.sangue = sangue; ficha.bio.alinhamento = alinhamento;
            ficha.bio.afiliacao = afiliacao; ficha.bio.dinheiro = dinheiro;
        });
        salvarFichaSilencioso();
        setSalvando(true); setTimeout(() => setSalvando(false), 2000);
    }, [raca, classe, idade, fisico, sangue, alinhamento, afiliacao, dinheiro, updateFicha]);

    const addEfeitoPassiva = useCallback(() => {
        if (!novoVal || !nomeEfeito.trim()) { alert('Preencha o nome e o valor do efeito!'); return; }
        setEfeitosTempPassiva(prev => [...prev, { nome: nomeEfeito.trim(), atributo: novoAtr, propriedade: novoProp, valor: novoVal }]);
        setNovoVal(''); setNomeEfeito('');
    }, [novoVal, nomeEfeito, novoAtr, novoProp]);

    const removerEfeitoPassiva = useCallback((i) => {
        setEfeitosTempPassiva(prev => { const newList = [...prev]; newList.splice(i, 1); return newList; });
    }, []);

    const passivas = useMemo(() => minhaFicha?.passivas || [], [minhaFicha?.passivas]);

    const editarPassiva = useCallback((index) => {
        const p = passivas[index];
        if (!p) return;
        setPassivaNome(p.nome); setPassivaTipo(p.tipo || 'Vantagem'); setEfeitosTempPassiva(JSON.parse(JSON.stringify(p.efeitos || []))); setEditIndex(index);
        document.getElementById('painel-edicao-passiva')?.scrollIntoView({ behavior: 'smooth' });
    }, [passivas]);

    const cancelarEdicao = useCallback(() => {
        setPassivaNome(''); setPassivaTipo('Vantagem'); setEfeitosTempPassiva([]); setEditIndex(-1);
    }, []);

    const salvarPassiva = useCallback(() => {
        if (passivaNome.trim() === '') { alert('Digite o nome da habilidade!'); return; }
        updateFicha((ficha) => {
            if (!ficha.passivas) ficha.passivas = [];
            const novaPassiva = { nome: passivaNome.trim(), tipo: passivaTipo, efeitos: JSON.parse(JSON.stringify(efeitosTempPassiva)) };
            if (editIndex >= 0) ficha.passivas[editIndex] = novaPassiva;
            else ficha.passivas.push(novaPassiva);
        });
        cancelarEdicao(); salvarFichaSilencioso();
    }, [passivaNome, passivaTipo, efeitosTempPassiva, editIndex, updateFicha, cancelarEdicao]);

    const removerPassiva = useCallback((index) => {
        updateFicha((ficha) => { if (!ficha.passivas) return; ficha.passivas.splice(index, 1); });
        if (editIndex === index) cancelarEdicao();
        salvarFichaSilencioso();
    }, [editIndex, updateFicha, cancelarEdicao]);

    const value = useMemo(() => ({ raca, setRaca, classe, setClasse, idade, setIdade, fisico, setFisico, sangue, setSangue, alinhamento, setAlinhamento, afiliacao, setAfiliacao, dinheiro, setDinheiro, passivaNome, setPassivaNome, passivaTipo, setPassivaTipo, efeitosTempPassiva, nomeEfeito, setNomeEfeito, novoAtr, setNovoAtr, novoProp, setNovoProp, novoVal, setNovoVal, editIndex, salvando, salvarBio, addEfeitoPassiva, removerEfeitoPassiva, editarPassiva, cancelarEdicao, salvarPassiva, removerPassiva, passivas }), [ raca, classe, idade, fisico, sangue, alinhamento, afiliacao, dinheiro, passivaNome, passivaTipo, efeitosTempPassiva, nomeEfeito, novoAtr, novoProp, novoVal, editIndex, salvando, salvarBio, addEfeitoPassiva, removerEfeitoPassiva, editarPassiva, cancelarEdicao, salvarPassiva, removerPassiva, passivas ]);

    return <NarrativaFormContext.Provider value={value}>{children}</NarrativaFormContext.Provider>;
}