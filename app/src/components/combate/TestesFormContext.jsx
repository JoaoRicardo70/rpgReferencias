import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { enviarParaFeed, salvarFichaSilencioso } from '../../services/firebase-sync';
import { getPoderDeLutaStatus } from '../../core/engine';
import { pegarDoisPrimeirosDigitos } from '../../core/utils';

export const SAVES = [
    { id: 'forca', label: 'Forca', attr: 'forca', cor: '#ff4d4d' },
    { id: 'destreza', label: 'Destreza', attr: 'destreza', cor: '#ffaa00' },
    { id: 'constituicao', label: 'Constituicao', attr: 'constituicao', cor: '#ffcc00' },
    { id: 'stamina', label: 'Stamina', attr: 'stamina', cor: '#aaff00' },
    { id: 'sabedoria', label: 'Sabedoria', attr: 'sabedoria', cor: '#00ffcc' },
    { id: 'inteligencia', label: 'Inteligencia', attr: 'inteligencia', cor: '#0088ff' },
    { id: 'energiaEsp', label: 'Energia Esp.', attr: 'energiaEsp', cor: '#cc00ff' },
    { id: 'carisma', label: 'Carisma', attr: 'carisma', cor: '#ff00ff' }
];

export const SKILLS = [
    { id: 'acrobacia', label: 'Acrobacia', attr: 'destreza' },
    { id: 'adestrar', label: 'Adestrar Animal', attr: 'carisma' },
    { id: 'arcana', label: 'Arcana', attr: 'inteligencia' },
    { id: 'armamento', label: 'Armamento', attr: 'sabedoria' },
    { id: 'atletismo', label: 'Atletismo', attr: 'forca' },
    { id: 'atuacao', label: 'Atuacao', attr: 'carisma' },
    { id: 'atualidades', label: 'Atualidades', attr: 'sabedoria' },
    { id: 'barganha', label: 'Barganha', attr: 'carisma' },
    { id: 'criacao', label: 'Criacao', attr: 'sabedoria' },
    { id: 'diplomacia', label: 'Diplomacia', attr: 'carisma' },
    { id: 'furtividade', label: 'Furtividade', attr: 'destreza' },
    { id: 'geografia', label: 'Geografia', attr: 'sabedoria' },
    { id: 'historia', label: 'Historia', attr: 'sabedoria' },
    { id: 'intimida', label: 'Intimidacao', attr: 'carisma' },
    { id: 'intuicao', label: 'Intuicao', attr: 'sabedoria' },
    { id: 'linguas', label: 'Linguas', attr: 'sabedoria' },
    { id: 'medicina', label: 'Medicina', attr: 'sabedoria' },
    { id: 'natureza', label: 'Natureza', attr: 'stamina' },
    { id: 'ocultismo', label: 'Ocultismo', attr: 'energiaEsp' },
    { id: 'percepcao', label: 'Percepcao', attr: 'sabedoria' },
    { id: 'pilot_barcos', label: 'Pilotagem (Barcos)', attr: 'destreza' },
    { id: 'pilot_carros', label: 'Pilotagem (Carros)', attr: 'destreza' },
    { id: 'pilot_aereo', label: 'Pilotagem (Helic/Avioes)', attr: 'destreza' },
    { id: 'pilot_motos', label: 'Pilotagem (Motos/Cavalos)', attr: 'destreza' },
    { id: 'prestidigitacao', label: 'Prestidigitacao', attr: 'destreza' },
    { id: 'procurar', label: 'Procurar', attr: 'sabedoria' },
    { id: 'religiao', label: 'Religiao', attr: 'sabedoria' },
    { id: 'sentir_motiv', label: 'Sentir Motivacao', attr: 'energiaEsp' },
    { id: 'sobrevivencia', label: 'Sobrevivencia', attr: 'sabedoria' },
    { id: 'tecnologia', label: 'Tecnologia', attr: 'sabedoria' },
    { id: 'topografia', label: 'Topografia', attr: 'sabedoria' },
    { id: 'trapacear', label: 'Trapacear', attr: 'carisma' },
    { id: 'voo', label: 'Voo', attr: 'destreza' }
];

const TestesFormContext = createContext(null);

export function useTestesForm() {
    const ctx = useContext(TestesFormContext);
    if (!ctx) return null;
    return ctx;
}

export function TestesFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const meuNome = useStore(s => s.meuNome);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const updateFicha = useStore(s => s.updateFicha);

    const [dadosConfig, setDadosConfig] = useState(1);
    const [facesConfig, setFacesConfig] = useState(20);
    const [bonusConfig, setBonusConfig] = useState(0);
    const [filtro, setFiltro] = useState('');

    const profGlobal = parseInt(minhaFicha.proficienciaBase) || 0;

    // 🔥 CORREÇÃO: recebia o valor CRU de `ficha[attr]?.base` e extraía os 2 primeiros dígitos "na
    // unha" (substring), o que (a) nunca somava o bônus oculto de Ascensão que TODAS as outras
    // rolagens (Acerto/Evasiva/Resistência, core/engine.js > calcularCA/getPoderDeLutaStatus) já
    // recebem, deixando Perícias/Testes de Resistência sem escalar com Ascensão; e (b) divergia
    // numericamente do algoritmo canônico pra valores de 3+ dígitos exibidos (ver
    // core/utils.js > pegarDoisPrimeirosDigitos: acima de 1000 ele usa n/1000, não os 2 primeiros
    // caracteres da string). Agora usa exatamente os mesmos dois helpers que calcularCA usa pra
    // Evasiva/Resistência (isRaw=true: base + Ascensão, sem outros buffs).
    const getModificadorDoisDigitos = useCallback((attrKey) => {
        return pegarDoisPrimeirosDigitos(getPoderDeLutaStatus(minhaFicha, attrKey, true));
    }, [minhaFicha]);

    const rolarDado = useCallback((qtd, faces) => {
        let sum = 0;
        let rolls = [];
        for (let i = 0; i < qtd; i++) {
            const r = Math.floor(Math.random() * faces) + 1;
            rolls.push(r);
            sum += r;
        }
        return { sum, details: rolls };
    }, []);

    const toggleProf = useCallback((id) => {
        updateFicha(f => {
            if (!f.proficiencias) f.proficiencias = {};
            const cur = f.proficiencias[id] || 0;
            f.proficiencias[id] = (cur + 1) % 3;
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const getProfLevel = useCallback((id) => {
        return minhaFicha.proficiencias?.[id] || 0;
    }, [minhaFicha.proficiencias]);

    const executarRolagem = useCallback((skillId, nomeTeste, tipoAttr, isSavingThrow = false) => {
        const qD = parseInt(dadosConfig) || 1;
        const fD = parseInt(facesConfig) || 20;
        const bonusFixo = parseInt(bonusConfig) || 0;

        const modBase = getModificadorDoisDigitos(tipoAttr);

        const profNivel = getProfLevel(skillId);
        const valorProficiencia = profNivel * profGlobal;

        const rolagem = rolarDado(qD, fD);
        const total = rolagem.sum + modBase + valorProficiencia + bonusFixo;

        const tipoFeed = isSavingThrow ? 'saving' : 'skill';

        let stringDados = `[${rolagem.details.join(', ')}]`;
        if (qD === 1) {
            if (rolagem.sum === 20 && fD === 20) stringDados = `[<strong>20</strong>] (CRITICO!)`;
            if (rolagem.sum === 1 && fD === 20) stringDados = `[<strong style="color:#ff003c;">1</strong>] (FALHA CRITICA!)`;
        }

        let detalheProf = profNivel === 2 ? `Expertise (+${valorProficiencia})` : profNivel === 1 ? `Proficiente (+${valorProficiencia})` : `S/ Prof (+0)`;

        const detalheCalc = `Dados: ${stringDados} <br/> Mod. ${tipoAttr.toUpperCase()} (${modBase}) + ${detalheProf} + Bonus (${bonusFixo})`;

        enviarParaFeed({
            tipo: tipoFeed,
            nome: meuNome,
            nomeTeste: nomeTeste,
            atributoAlvo: tipoAttr,
            total: total,
            detalheCalc: detalheCalc
        });

        setAbaAtiva('aba-log');
    }, [dadosConfig, facesConfig, bonusConfig, minhaFicha, meuNome, profGlobal, getModificadorDoisDigitos, getProfLevel, rolarDado, setAbaAtiva]);

    const skillsFiltradas = useMemo(() => {
        return SKILLS.filter(s => s.label.toLowerCase().includes(filtro.toLowerCase()));
    }, [filtro]);

    const value = useMemo(() => ({
        minhaFicha,
        profGlobal,
        dadosConfig,
        setDadosConfig,
        facesConfig,
        setFacesConfig,
        bonusConfig,
        setBonusConfig,
        filtro,
        setFiltro,
        getModificadorDoisDigitos,
        toggleProf,
        getProfLevel,
        executarRolagem,
        skillsFiltradas,
        updateFicha
    }), [
        minhaFicha,
        profGlobal,
        dadosConfig,
        facesConfig,
        bonusConfig,
        filtro,
        getModificadorDoisDigitos,
        toggleProf,
        getProfLevel,
        executarRolagem,
        skillsFiltradas,
        updateFicha
    ]);

    return (
        <TestesFormContext.Provider value={value}>
            {children}
        </TestesFormContext.Provider>
    );
}
