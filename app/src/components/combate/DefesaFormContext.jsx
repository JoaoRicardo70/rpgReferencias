import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { calcularReducao, calcularCA } from '../../core/engine';
import { getPassosReducaoDano, aplicarReducoesSequenciais, descreverReducoes } from '../../core/reducaoDano';
import { salvarFichaSilencioso, enviarParaFeed } from '../../services/firebase-sync';
import { danoExibidoParaBruto } from '../../core/vitals';
import { escalarDanoPelaVida, getVidaMaxExibidaFicha, getPontosVidaTotal } from '../../core/danoProporcional';
import { getPoderParaDisputa, getPoderDummie, calcularDisputaPoder, aplicarDisputaAoDano, descreverDisputa } from '../../core/disputaPoder';

// "auto" = quem desferiu o último golpe do feed (que não fui eu).
export const ATACANTE_AUTO = 'auto';
export const ATACANTE_NENHUM = 'nenhum';

const DefesaFormContext = createContext(null);

export function useDefesaForm() {
    const ctx = useContext(DefesaFormContext);
    if (!ctx) return null;
    return ctx;
}

export function DefesaFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const meuNome = useStore(s => s.meuNome);
    const personagens = useStore(s => s.personagens); // 🔥 VARREDURA GLOBAL DE PERSONAGENS DA MESA
    const updateFicha = useStore(s => s.updateFicha);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const feedCombate = useStore(s => s.feedCombate);
    const dummies = useStore(s => s.dummies);
    const divisorPoderMesa = useStore(s => s.divisorPoderMesa);

    const caEvasiva = calcularCA(minhaFicha, 'evasiva');
    const caResistencia = calcularCA(minhaFicha, 'resistencia');

    const [evaDados, setEvaDados] = useState(0);
    const [evaFaces, setEvaFaces] = useState(20);
    const [evaProf, setEvaProf] = useState(0);
    const [evaBonus, setEvaBonus] = useState(0);

    const [resDados, setResDados] = useState(0);
    const [resFaces, setResFaces] = useState(20);
    const [resProf, setResProf] = useState(0);
    const [resBonus, setResBonus] = useState(0);

    const [redEnergia, setRedEnergia] = useState('mana');
    const [redPerc, setRedPerc] = useState(0);
    const [redMult, setRedMult] = useState(1);
    
    const [elementoInc, setElementoInc] = useState('fisico'); 
    const [danoRecebidoInc, setDanoRecebidoInc] = useState('');
    // ⚖️ Quem desferiu o golpe: decide a Disputa de Poder (core/disputaPoder.js). Valores:
    // ATACANTE_AUTO, ATACANTE_NENHUM, "p:<nome do personagem>" ou "d:<id da entidade>".
    const [atacanteInc, setAtacanteInc] = useState(ATACANTE_AUTO);
    // 🎲 O valor digitado é o número do dado (veio do feed)? Então ele pesa na MINHA Vida (core/danoProporcional.js).
    const [danoDeDado, setDanoDeDado] = useState(true);

    const ultimoGolpeRecebido = useMemo(() => {
        const feed = feedCombate || [];
        for (let i = feed.length - 1; i >= 0; i--) {
            const f = feed[i];
            // Golpe com alvoNome foi numa entidade do Mapa (dummy), não em um jogador: não conta.
            if (f && f.tipo === 'dano' && f.nome && f.nome !== meuNome && !f.alvoNome) return f;
        }
        return null;
    }, [feedCombate, meuNome]);

    const opcoesAtacante = useMemo(() => {
        const jogadores = Object.keys(personagens || {})
            .filter(n => n && n !== meuNome && personagens[n])
            .map(n => ({ valor: `p:${n}`, nome: n, isDummie: false }));
        const entidades = Object.entries(dummies || {})
            .filter(([, d]) => d && getPoderDummie(d) !== null)
            .map(([id, d]) => ({ valor: `d:${id}`, nome: d.nome || 'Entidade', isDummie: true }));
        return [...jogadores, ...entidades];
    }, [personagens, dummies, meuNome]);

    // Resolve o atacante escolhido no Poder dele. Pra quem desferiu o último golpe recebido, usa o
    // Poder gravado no feed no momento do golpe (poderAtacante); senão, o Poder Atual dele agora.
    const disputaDefesa = useMemo(() => {
        let nome = null;
        let poder = null;
        const escolha = atacanteInc === ATACANTE_AUTO ? (ultimoGolpeRecebido ? `p:${ultimoGolpeRecebido.nome}` : ATACANTE_NENHUM) : atacanteInc;
        if (escolha.startsWith('p:')) {
            nome = escolha.slice(2);
            // Só o golpe mais recente que recebi traz o Poder do momento; outro nome = Poder de agora.
            const golpe = ultimoGolpeRecebido && ultimoGolpeRecebido.nome === nome ? ultimoGolpeRecebido : null;
            const gravado = golpe ? Number(golpe.poderAtacante) : NaN;
            poder = (golpe && golpe.poderAtacante !== undefined && golpe.poderAtacante !== null && Number.isFinite(gravado))
                ? gravado
                : getPoderParaDisputa(personagens?.[nome], divisorPoderMesa);
        } else if (escolha.startsWith('d:')) {
            const d = dummies?.[escolha.slice(2)];
            nome = d?.nome || 'Entidade';
            poder = getPoderDummie(d);
        }
        if (!nome) return { nomeAtacante: null, disputa: null };
        return { nomeAtacante: nome, disputa: calcularDisputaPoder(poder, getPoderParaDisputa(minhaFicha, divisorPoderMesa)) };
    }, [atacanteInc, ultimoGolpeRecebido, personagens, dummies, minhaFicha, divisorPoderMesa]);

    // 🔥 LEITURA DINÂMICA DO COMPÊNDIO COM CORREÇÃO DE VARREDURA 🔥
    const overridesCompendio = useMemo(() => {
        let globais = { elementos: {} };

        if (personagens) {
            Object.values(personagens).forEach(p => {
                if (p && p.compendioOverrides && p.compendioOverrides.elementos) {
                    Object.assign(globais.elementos, p.compendioOverrides.elementos);
                }
            });
        }

        if (minhaFicha && minhaFicha.compendioOverrides && minhaFicha.compendioOverrides.elementos) {
            Object.assign(globais.elementos, minhaFicha.compendioOverrides.elementos);
        }

        return globais;
    }, [minhaFicha, personagens]);

    const elementosDinamicos = useMemo(() => {
        const baseArray = [
            { id: 'fisico', nome: 'Cinético', icone: '⚔️', cor: '#cccccc' },
            { id: 'fogo', nome: 'Fogo', icone: '🔥', cor: '#ff4444' },
            { id: 'agua', nome: 'Água', icone: '💧', cor: '#0088ff' },
            { id: 'raio', nome: 'Raio', icone: '⚡', cor: '#ffcc00' },
            { id: 'gelo', nome: 'Gelo', icone: '❄️', cor: '#00ffff' },
            { id: 'luz', nome: 'Luz', icone: '☀️', cor: '#fffbd6' },
            { id: 'trevas', nome: 'Trevas', icone: '🌑', cor: '#8800ff' }
        ];
        const overridesObj = overridesCompendio['elementos'] || {};
        const map = {};
        baseArray.forEach(item => map[item.id] = { ...item });
        Object.keys(overridesObj).forEach(k => {
            if (overridesObj[k].deletado) delete map[k];
            else if (map[k]) map[k] = { ...map[k], ...overridesObj[k] };
            else map[k] = overridesObj[k];
        });
        return Object.values(map);
    }, [overridesCompendio]);

    const rolar = useCallback((qtd, faces) => {
        let sum = 0;
        let rolls = [];
        for (let i = 0; i < qtd; i++) {
            const r = Math.floor(Math.random() * faces) + 1;
            rolls.push(r);
            sum += r;
        }
        return { sum, str: `[${rolls.join(', ')}]` };
    }, []);

    const declararEvasiva = useCallback(() => {
        const qD = parseInt(evaDados) || 0;
        const fD = parseInt(evaFaces) || 20;
        const prof = parseInt(evaProf) || 0;
        const bonus = parseInt(evaBonus) || 0;

        let diceTotal = 0;
        let diceStr = '';
        if (qD > 0) {
            const r = rolar(qD, fD);
            diceTotal = r.sum;
            diceStr = `\u{1F3B2} +Dados: ${r.str} | `;
        }

        const total = caEvasiva + diceTotal + prof + bonus;
        const baseCalc = `${diceStr}CA Evasiva (${caEvasiva}) + Prof (${prof}) + B\u00f3nus Extra (${bonus})`;

        const feedData = { tipo: 'evasiva', nome: meuNome, total, baseCalc };
        enviarParaFeed(feedData);
        setAbaAtiva('aba-log');
    }, [evaDados, evaFaces, evaProf, evaBonus, caEvasiva, meuNome, setAbaAtiva, rolar]);

    const declararResistencia = useCallback(() => {
        const qD = parseInt(resDados) || 0;
        const fD = parseInt(resFaces) || 20;
        const prof = parseInt(resProf) || 0;
        const bonus = parseInt(resBonus) || 0;

        let diceTotal = 0;
        let diceStr = '';
        if (qD > 0) {
            const r = rolar(qD, fD);
            diceTotal = r.sum;
            diceStr = `\u{1F3B2} +Dados: ${r.str} | `;
        }

        const total = caResistencia + diceTotal + prof + bonus;
        const baseCalc = `${diceStr}CA Resist\u00eancia (${caResistencia}) + Prof (${prof}) + B\u00f3nus Extra (${bonus})`;

        const feedData = { tipo: 'resistencia', nome: meuNome, total, baseCalc };
        enviarParaFeed(feedData);
        setAbaAtiva('aba-log');
    }, [resDados, resFaces, resProf, resBonus, caResistencia, meuNome, setAbaAtiva, rolar]);

    const declararReducao = useCallback(() => {
        const k = redEnergia;
        const perc = parseFloat(redPerc) || 0;
        const mb = parseFloat(redMult) || 1;
        const itensEquipados = minhaFicha.inventario ? minhaFicha.inventario.filter(i => i.equipado) : [];
        const result = calcularReducao({ energiaKey: k, perc, multBase: mb, minhaFicha, itensEquipados, rE: 0 });

        if (result.erro) {
            alert(result.erro);
            return;
        }
        if (result.drenos) {
            updateFicha((ficha) => {
                for (let i = 0; i < result.drenos.length; i++) {
                    ficha[result.drenos[i].key].atual -= result.drenos[i].valor;
                }
            });
        }
        salvarFichaSilencioso();

        const feedData = { tipo: 'escudo', nome: meuNome, ...result };
        enviarParaFeed(feedData);
        setAbaAtiva('aba-log');
    }, [redEnergia, redPerc, redMult, minhaFicha, meuNome, updateFicha, setAbaAtiva]);

    const sofrerDanoBruto = useCallback(() => {
        const dano = parseInt(danoRecebidoInc) || 0;
        if (dano <= 0) return alert('Digite um valor de dano válido para receber.');

        const { disputa, nomeAtacante } = disputaDefesa;
        const danoBase = danoDeDado
            ? escalarDanoPelaVida(dano, getVidaMaxExibidaFicha(minhaFicha), getPontosVidaTotal(useStore.getState().cenario))
            : dano;
        const danoDisputa = aplicarDisputaAoDano(danoBase, disputa);
        // 🛡️ Reduções/Resistências aplicadas em SEQUÊNCIA, uma de cada vez (core/reducaoDano.js).
        const reduzido = aplicarReducoesSequenciais(danoDisputa, getPassosReducaoDano(minhaFicha, elementoInc, elementosDinamicos.find(e => e.id === elementoInc)?.nome));
        const danoFinal = reduzido.final;

        updateFicha((ficha) => {
            if (ficha.vida) {
                // O dano digitado é o número EXIBIDO (feed/tela); vida.atual é bruta.
                ficha.vida.atual = Math.max(0, (ficha.vida.atual || 0) - danoExibidoParaBruto(danoFinal));
            }
        });
        salvarFichaSilencioso();

        const mensagemElemental = reduzido.detalhe.length > 0 ? ` [${descreverReducoes(reduzido)}]` : '';

        const nomeElemento = elementosDinamicos.find(e => e.id === elementoInc)?.nome || elementoInc;

        const deQuem = nomeAtacante ? ` de ${nomeAtacante}` : '';
        const texto = `Recebeu ${danoFinal} de dano${deQuem}! (Original: ${dano} de ${nomeElemento.toUpperCase()})${mensagemElemental}`;

        // Quem leva vantagem na Disputa de Poder é informação do Mestre (textoMestre).
        const feedData = { tipo: 'sistema', nome: meuNome, texto: texto, ...(disputa && disputa.ativa ? { textoMestre: descreverDisputa(disputa) } : {}) };
        enviarParaFeed(feedData);
        
        setDanoRecebidoInc('');
        setElementoInc('fisico');
        setAtacanteInc(ATACANTE_AUTO);
        // Volta ao padrão (dado): um dano fixo desmarcado vale só pra este golpe.
        setDanoDeDado(true);
        setAbaAtiva('aba-log');
    }, [danoRecebidoInc, elementoInc, minhaFicha, meuNome, updateFicha, setAbaAtiva, elementosDinamicos, disputaDefesa, danoDeDado]);

    const value = useMemo(() => ({
        evaDados, setEvaDados, evaFaces, setEvaFaces, evaProf, setEvaProf, evaBonus, setEvaBonus,
        resDados, setResDados, resFaces, setResFaces, resProf, setResProf, resBonus, setResBonus,
        redEnergia, setRedEnergia, redPerc, setRedPerc, redMult, setRedMult,
        elementoInc, setElementoInc, danoRecebidoInc, setDanoRecebidoInc,
        atacanteInc, setAtacanteInc, opcoesAtacante, ultimoGolpeRecebido, disputaDefesa, danoDeDado, setDanoDeDado,
        caEvasiva, caResistencia,
        elementosDinamicos, 
        declararEvasiva, declararResistencia, declararReducao, sofrerDanoBruto
    }), [
        evaDados, evaFaces, evaProf, evaBonus, resDados, resFaces, resProf, resBonus,
        redEnergia, redPerc, redMult, elementoInc, danoRecebidoInc, caEvasiva, caResistencia,
        atacanteInc, opcoesAtacante, ultimoGolpeRecebido, disputaDefesa, danoDeDado,
        elementosDinamicos, declararEvasiva, declararResistencia, declararReducao, sofrerDanoBruto
    ]);

    return (
        <DefesaFormContext.Provider value={value}>
            {children}
        </DefesaFormContext.Provider>
    );
}