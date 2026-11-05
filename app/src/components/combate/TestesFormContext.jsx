import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { enviarParaFeed } from '../../services/firebase-sync';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { getRawBase } from '../../core/attributes';
import { modificadorDezena } from '../../core/utils';
import { rolarDadosComVantagem } from '../../core/engine';
import { modificadoresDeEstados } from '../../core/condicoes';
import { valoresDeEfeitos, montarContextoDeCombate } from '../../core/efeitosCondicionais';

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
    // Ficha em foco: a minha, ou a da entidade que o Mestre está vendo na Ficha Definitiva.
    const { ficha: minhaFicha, updateFicha, nome: meuNome } = useFichaAtiva();
    const salvarFichaSilencioso = useCallSaveAtivo();
    const setAbaAtiva = useStore(s => s.setAbaAtiva);

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
    // 🩹 Teste de Perícia/Resistência usa só a DEZENA do atributo (120 -> +12, 128 -> +12), sem a
    // Ascensão oculta: o bônus não estoura. Acerto/Evasiva/Resistência de combate seguem em core/engine.js.
    const getModificadorDoisDigitos = useCallback((attrKey) => {
        return modificadorDezena(getRawBase(minhaFicha, attrKey));
    }, [minhaFicha]);

    // 🎲 d20 PURO: sem atributo, proficiência nem bônus — só o dado, direto no feed.
    const rolarD20Puro = useCallback(() => {
        const r = Math.floor(Math.random() * 20) + 1;
        let stringDados = `[<strong>${r}</strong>]`;
        if (r === 20) stringDados += ' (CRITICO!)';
        if (r === 1) stringDados = '[<strong style="color:#ff003c;">1</strong>] (FALHA CRITICA!)';
        enviarParaFeed({
            tipo: 'skill',
            nome: meuNome,
            nomeTeste: 'd20 Puro',
            atributoAlvo: 'puro',
            total: r,
            detalheCalc: `Dados: ${stringDados} <br/> Sem modificadores`
        });
        setAbaAtiva('aba-log');
    }, [meuNome, setAbaAtiva]);

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
    }, [updateFicha, salvarFichaSilencioso]);

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

        // 🩸 Estados negativos (Exausto, Imobilizado, Vulnerável, Lento, Cego/Surdo...) dão desvantagem em testes (core/condicoes.js).
        const estados = modificadoresDeEstados(minhaFicha);
        const desvEstado = estados.desvTestes + ((estados.desvPorAtributo && estados.desvPorAtributo[tipoAttr]) || 0);
        // 🎲 Efeitos VANTAGEM/DESVANTAGEM e PISO_D20 com escopo de teste (core/efeitosCondicionais.js): 'teste' vale em todo teste e
        // 'teste:<perícia ou atributo>' só naquele. Vantagem/desvantagem sem escopo valem só em ataque; o piso sem escopo vale em todo teste.
        const contextoTeste = montarContextoDeCombate(minhaFicha);
        const rolagemTeste = { tipo: 'teste', ids: [skillId, tipoAttr] };
        const somaEfeitos = (atributo, escopoPadrao) => Math.max(0, Math.floor(valoresDeEfeitos(minhaFicha, atributo, { contexto: contextoTeste, rolagem: rolagemTeste, escopoPadrao }).reduce((acc, v) => acc + v, 0)));
        const vantEfeito = somaEfeitos('vantagem', 'ataque');
        const desvEfeito = somaEfeitos('desvantagem', 'ataque');
        const pisoD20 = Math.max(0, ...valoresDeEfeitos(minhaFicha, 'piso_d20', { contexto: contextoTeste, rolagem: rolagemTeste, escopoPadrao: 'teste' }).map(v => Math.floor(v)));
        const desvTotal = desvEstado + desvEfeito;
        const usaVantDesv = vantEfeito > 0 || desvTotal > 0;
        let rolagem = rolarDado(qD, fD);
        let textoDesv = '';
        let dadoMantido = null;
        if (usaVantDesv) {
            const r = rolarDadosComVantagem(qD, fD, vantEfeito, desvTotal);
            rolagem = { sum: r.sD, details: [r.rolagemTexto] };
            dadoMantido = r.mantidos && r.mantidos.length === 1 ? r.mantidos[0] : null;
            if (desvEstado > 0) textoDesv += ` <br/> 🩸 ${desvEstado} desvantagem(ns) por estado negativo`;
            if (vantEfeito > 0) textoDesv += ` <br/> 🎲 ${vantEfeito} vantagem(ns) por efeito`;
            if (desvEfeito > 0) textoDesv += ` <br/> 🎲 ${desvEfeito} desvantagem(ns) por efeito`;
        }
        // Piso do d20 ("7 ou menos vale 8"): só com um único d20.
        let ajustePiso = 0;
        if (pisoD20 > 0 && qD === 1 && fD === 20) {
            const dado = dadoMantido !== null ? dadoMantido : rolagem.sum;
            if (dado < pisoD20) { ajustePiso = pisoD20 - dado; textoDesv += ` <br/> 🎲 Piso do d20: ${dado} vale ${pisoD20}`; }
        }
        const total = rolagem.sum + ajustePiso + modBase + valorProficiencia + bonusFixo;

        const tipoFeed = isSavingThrow ? 'saving' : 'skill';

        let stringDados = usaVantDesv ? rolagem.details[0] : `[${rolagem.details.join(", ")}]`;
        if (qD === 1 && !usaVantDesv && ajustePiso === 0) {
            if (rolagem.sum === 20 && fD === 20) stringDados = `[<strong>20</strong>] (CRITICO!)`;
            if (rolagem.sum === 1 && fD === 20) stringDados = `[<strong style="color:#ff003c;">1</strong>] (FALHA CRITICA!)`;
        }

        let detalheProf = profNivel === 2 ? `Expertise (+${valorProficiencia})` : profNivel === 1 ? `Proficiente (+${valorProficiencia})` : `S/ Prof (+0)`;

        const detalheCalc = `Dados: ${stringDados} <br/> Mod. ${tipoAttr.toUpperCase()} (${modBase}) + ${detalheProf} + Bonus (${bonusFixo})${textoDesv}`;

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
        rolarD20Puro,
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
        rolarD20Puro,
        skillsFiltradas,
        updateFicha
    ]);

    return (
        <TestesFormContext.Provider value={value}>
            {children}
        </TestesFormContext.Provider>
    );
}
