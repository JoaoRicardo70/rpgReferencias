import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import useStore from '../../stores/useStore';
import { getBuffs, getEfeitosDeClasse } from '../../core/attributes';
import { getVitalMxDisplay, getVidaTotalMaxDisplay } from '../../core/vitals';
import { calcularDano } from '../../core/engine';
import { salvarFichaSilencioso, enviarParaFeed, salvarDummie, salvarCenarioCompleto } from '../../services/firebase-sync';

const AtaqueFormContext = createContext(null);

export const STATS_LIST = [
    { value: 'forca', label: 'Forca' }, { value: 'destreza', label: 'Destreza' }, { value: 'inteligencia', label: 'Inteligencia' },
    { value: 'sabedoria', label: 'Sabedoria' }, { value: 'energiaEsp', label: 'Energia Esp.' }, { value: 'carisma', label: 'Carisma' },
    { value: 'stamina', label: 'Stamina' }, { value: 'constituicao', label: 'Constituicao' },
];

export const ENERGIA_LIST = [
    { value: 'mana', label: 'Mana' }, { value: 'aura', label: 'Aura' }, { value: 'chakra', label: 'Chakra' }, { value: 'corpo', label: 'Corpo' },
];

export function useAtaqueForm() {
    const ctx = useContext(AtaqueFormContext);
    if (!ctx) return null;
    return ctx;
}

export function AtaqueFormProvider({ children }) {
    const minhaFicha = useStore(s => s.minhaFicha);
    const meuNome = useStore(s => s.meuNome);
    const personagens = useStore(s => s.personagens); 
    const updateFicha = useStore(s => s.updateFicha);
    const setAbaAtiva = useStore(s => s.setAbaAtiva);
    const abaAtiva = useStore(s => s.abaAtiva);
    const feedCombate = useStore(s => s.feedCombate);
    const alvoSelecionado = useStore(s => s.alvoSelecionado);
    const dummies = useStore(s => s.dummies);
    // 🔥 No store (não useState local) de propósito: o Mapa monta um AtaqueFormProvider PRÓPRIO,
    // separado do da aba Ataque, só enquanto a aba do Mapa está em foco (ver MapaPanel.jsx >
    // mapaEmFoco) — um useState local perderia esse valor (voltando a desmarcado) toda vez que o
    // provider do Mapa desmontasse/remontasse ao trocar de aba, o que já foi relatado como bug.
    const ignorarTravaAcerto = useStore(s => s.ignorarTravaAcerto);
    const setIgnorarTravaAcerto = useStore(s => s.setIgnorarTravaAcerto);

    const ac = minhaFicha.ataqueConfig || {};

    const [armaStatusUsados, setArmaStatusUsados] = useState(ac.armaStatusUsados || ['forca']);
    const [armaEnergiaCombustao, setArmaEnergiaCombustao] = useState(ac.armaEnergiaCombustao || 'mana');
    const [armaPercEnergia, setArmaPercEnergia] = useState(ac.armaPercEnergia || 0);

    const [critNormalMin, setCritNormalMin] = useState(ac.criticoNormalMin || 16);
    const [critNormalMax, setCritNormalMax] = useState(ac.criticoNormalMax || 18);
    const [critFatalMin, setCritFatalMin] = useState(ac.criticoFatalMin || 19);
    const [critFatalMax, setCritFatalMax] = useState(ac.criticoFatalMax || 20);

    const [autoCritNormal, setAutoCritNormal] = useState(false);
    const [autoCritFatal, setAutoCritFatal] = useState(false);
    const [forcarCritNormal, setForcarCritNormal] = useState(false);
    const [forcarCritFatal, setForcarCritFatal] = useState(false);
    
    const [elementoAtivo, setElementoAtivo] = useState('fisico');

    const [skillConfigs, setSkillConfigs] = useState({});
    const [podeRolarDano, setPodeRolarDano] = useState(true);
    const [furiaAcalmadaMsg, setFuriaAcalmadaMsg] = useState(false);

    const [customFormula, setCustomFormula] = useState('');
    const [customLetalidade, setCustomLetalidade] = useState(0);
    const [customEnergiaTipo, setCustomEnergiaTipo] = useState('nenhum');
    const [customEnergiaCusto, setCustomEnergiaCusto] = useState(0);

    const overridesCompendio = useMemo(() => {
        let globais = { classes: {}, grands: {}, condicoes: {}, elementos: {}, regras: {} };

        if (personagens) {
            Object.values(personagens).forEach(p => {
                if (p && p.compendioOverrides) {
                    if (p.compendioOverrides.classes) Object.assign(globais.classes, p.compendioOverrides.classes);
                    if (p.compendioOverrides.grands) Object.assign(globais.grands, p.compendioOverrides.grands);
                    if (p.compendioOverrides.condicoes) Object.assign(globais.condicoes, p.compendioOverrides.condicoes);
                    if (p.compendioOverrides.elementos) Object.assign(globais.elementos, p.compendioOverrides.elementos);
                    if (p.compendioOverrides.regras) Object.assign(globais.regras, p.compendioOverrides.regras);
                }
            });
        }

        if (minhaFicha && minhaFicha.compendioOverrides) {
            if (minhaFicha.compendioOverrides.classes) Object.assign(globais.classes, minhaFicha.compendioOverrides.classes);
            if (minhaFicha.compendioOverrides.grands) Object.assign(globais.grands, minhaFicha.compendioOverrides.grands);
            if (minhaFicha.compendioOverrides.condicoes) Object.assign(globais.condicoes, minhaFicha.compendioOverrides.condicoes);
            if (minhaFicha.compendioOverrides.elementos) Object.assign(globais.elementos, minhaFicha.compendioOverrides.elementos);
            if (minhaFicha.compendioOverrides.regras) Object.assign(globais.regras, minhaFicha.compendioOverrides.regras);
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

    const multiplicadorFuriaClasse = useMemo(() => {
        let maxFuria = 0;
        const scanFuria = (efs) => {
            if (!efs) return;
            efs.forEach(e => {
                if (!e) return;
                let p = (e.propriedade || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (p === 'furia_berserker') {
                    let v = parseFloat(e.valor) || 0;
                    if (v > maxFuria) maxFuria = v;
                }
            });
        };

        if (minhaFicha) {
            (minhaFicha.poderes || []).forEach(p => { if (p && p.ativa) scanFuria(p.efeitos); scanFuria(p.efeitosPassivos); });
            (minhaFicha.inventario || []).forEach(i => { if (i && i.equipado) { scanFuria(i.efeitos); scanFuria(i.efeitosPassivos); } });
            (minhaFicha.passivas || []).forEach(p => scanFuria(p.efeitos));
            scanFuria(getEfeitosDeClasse(minhaFicha));
        }

        return maxFuria;
    }, [minhaFicha]);

    // getVidaTotalMaxDisplay já decide a escala ignorando Formas (getMaximoSemFormas) — evita que
    // uma Forma temporária empurre "maxVida" através de uma fronteira de dígitos e infle
    // percAtualLostFloor artificialmente (disparando Fúria Berserker sem o personagem ter perdido
    // Vida de verdade). Usa o TOTAL somando todas as barras de Vida (getNumBarrasVida), não só uma.
    const maxVida = minhaFicha ? getVidaTotalMaxDisplay(minhaFicha) : 1;

    const atualVida = minhaFicha?.vida?.atual ?? maxVida;
    const percAtualLostFloor = Math.floor(maxVida > 0 ? Math.max(0, ((maxVida - atualVida) / maxVida) * 100) : 0);
    const furiaMax = minhaFicha?.combate?.furiaMax || 0;
    const percEfetivoParaDisplay = Math.max(percAtualLostFloor, furiaMax);

    const multiplicadorFuriaVisor = useMemo(() => {
        if (percEfetivoParaDisplay === 1) return multiplicadorFuriaClasse;
        else if (percEfetivoParaDisplay >= 2) return percEfetivoParaDisplay;
        return 0;
    }, [percEfetivoParaDisplay, multiplicadorFuriaClasse]);

    const dummieAlvo = alvoSelecionado && dummies[alvoSelecionado] ? dummies[alvoSelecionado] : null;

    const armaEquipada = useMemo(() => (minhaFicha.inventario || []).find(i => i.equipado && i.tipo === 'arma'), [minhaFicha.inventario]);
    const poderesAtivos = useMemo(() => (minhaFicha.poderes || []).filter(p => p && p.ativa), [minhaFicha.poderes]);
    const magiasOfensivas = useMemo(() => (minhaFicha.ataquesElementais || []).filter(m => m && m.equipado && m.tipoMecanica !== 'suporte'), [minhaFicha.ataquesElementais]);

    useEffect(() => {
        if (multiplicadorFuriaClasse > 0 && percAtualLostFloor > furiaMax) {
            updateFicha(f => { if (!f.combate) f.combate = {}; f.combate.furiaMax = percAtualLostFloor; });
            salvarFichaSilencioso();
        }
    }, [percAtualLostFloor, furiaMax, multiplicadorFuriaClasse, updateFicha]);

    useEffect(() => {
        if (!dummieAlvo) {
            setPodeRolarDano(true);
            return;
        }
        const meuUltimoAcerto = [...feedCombate].reverse().find(f => f.nome === meuNome && f.tipo === 'acerto');

        if (meuUltimoAcerto) {
            let acertou = false;
            if (meuUltimoAcerto.alvosArea && meuUltimoAcerto.alvosArea.length > 0) {
                acertou = meuUltimoAcerto.alvosArea.some(a => a.acertou);
            } else if (dummieAlvo && meuUltimoAcerto.alvoNome === dummieAlvo.nome) {
                acertou = meuUltimoAcerto.acertouAlvo;
            } else if (!dummieAlvo && !meuUltimoAcerto.alvoNome) {
                acertou = true;
            }
            setPodeRolarDano(acertou);
        } else {
            setPodeRolarDano(false);
        }
    }, [feedCombate, meuNome, dummieAlvo]);

    useEffect(() => {
        const ac2 = minhaFicha.ataqueConfig || {};
        setArmaStatusUsados(ac2.armaStatusUsados || ['forca']); setArmaEnergiaCombustao(ac2.armaEnergiaCombustao || 'mana');
        setArmaPercEnergia(ac2.armaPercEnergia || 0); setCritNormalMin(ac2.criticoNormalMin || 16);
        setCritNormalMax(ac2.criticoNormalMax || 18); setCritFatalMin(ac2.criticoFatalMin || 19);
        setCritFatalMax(ac2.criticoFatalMax || 20);
    }, [minhaFicha.ataqueConfig]);

    useEffect(() => {
        const lastAcerto = [...feedCombate].reverse().find(f => f.nome === meuNome && f.tipo === 'acerto');
        if (lastAcerto && lastAcerto.rolagem) {
            let maxDado = 0;
            let regexStrong = /<strong>(\d+)<\/strong>/g;
            let match;
            while ((match = regexStrong.exec(lastAcerto.rolagem)) !== null) {
                let v = parseInt(match[1]);
                if (v > maxDado) maxDado = v;
            }
            if (maxDado === 0) {
                let regexArr = /\[(.*?)\]/;
                let mArr = regexArr.exec(lastAcerto.rolagem);
                if (mArr) {
                    let clean = mArr[1].replace(/<[^>]*>?/gm, '');
                    let nums = clean.split(',').map(n => parseInt(n.trim())).filter(n => !isNaN(n));
                    if (nums.length > 0) maxDado = Math.max(...nums);
                }
            }
            setAutoCritFatal(maxDado >= critFatalMin && maxDado <= critFatalMax);
            setAutoCritNormal(maxDado >= critNormalMin && maxDado <= critNormalMax);
        } else {
            setAutoCritFatal(false); setAutoCritNormal(false);
        }
    }, [feedCombate, meuNome, critNormalMin, critNormalMax, critFatalMin, critFatalMax]);

    useEffect(() => {
        const configs = {};
        poderesAtivos.forEach(p => { configs[p.id] = { statusUsados: p.statusUsados || ['forca'], energiaCombustao: p.energiaCombustao || 'mana' }; });
        magiasOfensivas.forEach(m => { configs[m.id] = { statusUsados: m.statusUsados || ['inteligencia'], energiaCombustao: m.energiaCombustao || 'mana' }; });
        setSkillConfigs(configs);
    }, [minhaFicha.poderes, minhaFicha.ataquesElementais]);

    const acalmarFuria = useCallback((e) => {
        e.preventDefault(); updateFicha(f => { if (!f.combate) f.combate = {}; f.combate.furiaMax = percAtualLostFloor; });
        salvarFichaSilencioso(); setFuriaAcalmadaMsg(true); setTimeout(() => setFuriaAcalmadaMsg(false), 2000);
    }, [updateFicha, percAtualLostFloor]);

    const updateSkillConfig = useCallback((id, field, value) => { setSkillConfigs(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } })); }, []);
    const toggleSkillStat = useCallback((id, statValue) => {
        setSkillConfigs(prev => {
            const current = prev[id]?.statusUsados || ['forca'];
            const updated = current.includes(statValue) ? current.filter(v => v !== statValue) : [...current, statValue];
            return { ...prev, [id]: { ...prev[id], statusUsados: updated.length > 0 ? updated : ['forca'] } };
        });
    }, []);

    const toggleArmaStat = useCallback((statValue) => {
        setArmaStatusUsados(prev => {
            if (prev.includes(statValue)) return prev.filter(v => v !== statValue);
            return [...prev, statValue];
        });
    }, []);

    const salvarConfigAtaque = useCallback(() => {
        updateFicha((ficha) => {
            if (!ficha.ataqueConfig) ficha.ataqueConfig = {};
            ficha.ataqueConfig.armaStatusUsados = armaStatusUsados; ficha.ataqueConfig.armaEnergiaCombustao = armaEnergiaCombustao;
            ficha.ataqueConfig.armaPercEnergia = parseFloat(armaPercEnergia) || 0; ficha.ataqueConfig.criticoNormalMin = parseInt(critNormalMin) || 16;
            ficha.ataqueConfig.criticoNormalMax = parseInt(critNormalMax) || 18; ficha.ataqueConfig.criticoFatalMin = parseInt(critFatalMin) || 19;
            ficha.ataqueConfig.criticoFatalMax = parseInt(critFatalMax) || 20;

            if (ficha.poderes) ficha.poderes.forEach(p => { if (p && skillConfigs[p.id]) { p.statusUsados = skillConfigs[p.id].statusUsados; p.energiaCombustao = skillConfigs[p.id].energiaCombustao; } });
            if (ficha.ataquesElementais) ficha.ataquesElementais.forEach(m => { if (m && skillConfigs[m.id]) { m.statusUsados = skillConfigs[m.id].statusUsados; m.energiaCombustao = skillConfigs[m.id].energiaCombustao; } });
        });
        salvarFichaSilencioso();
    }, [updateFicha, armaStatusUsados, armaEnergiaCombustao, armaPercEnergia, critNormalMin, critNormalMax, critFatalMin, critFatalMax, skillConfigs]);

    const salvarFormula = useCallback(() => {
        const nomeForm = window.prompt("Como deseja nomear esta fórmula de ataque?");
        if (!nomeForm || !nomeForm.trim()) return;

        updateFicha(ficha => {
            if (!ficha.ataqueConfig) ficha.ataqueConfig = {};
            if (!ficha.ataqueConfig.formulasSalvas) ficha.ataqueConfig.formulasSalvas = [];
            ficha.ataqueConfig.formulasSalvas.push({
                id: Date.now(),
                nome: nomeForm.trim(),
                formula: customFormula,
                letalidade: parseInt(customLetalidade) || 0,
                energiaTipo: customEnergiaTipo,
                energiaCusto: parseFloat(customEnergiaCusto) || 0
            });
        });
        salvarFichaSilencioso();
    }, [customFormula, customLetalidade, customEnergiaTipo, customEnergiaCusto, updateFicha]);

    const deletarFormula = useCallback((id) => {
        updateFicha(ficha => {
            if (ficha.ataqueConfig && ficha.ataqueConfig.formulasSalvas) {
                ficha.ataqueConfig.formulasSalvas = ficha.ataqueConfig.formulasSalvas.filter(f => f.id !== id);
            }
        });
        salvarFichaSilencioso();
    }, [updateFicha]);

    const rolarDanoCustomizado = useCallback((formulaOverride, letalidadeOverride, energiaTipoOverride, energiaCustoOverride) => {
        const formAtiva = formulaOverride !== undefined ? formulaOverride : customFormula;
        const letalAtiva = letalidadeOverride !== undefined ? letalidadeOverride : customLetalidade;
        const tipoAtiva = energiaTipoOverride !== undefined ? energiaTipoOverride : customEnergiaTipo;
        const custoAtiva = energiaCustoOverride !== undefined ? energiaCustoOverride : customEnergiaCusto;

        if (!formAtiva.trim()) return;

        let expressao = formAtiva.toLowerCase().replace(/\s+/g, '').replace(/x/g, '*');
        
        if (/[^0-9d\*\+\-\/\(\)\.]/.test(expressao)) {
            alert('Fórmula inválida! Use apenas números, d, x, *, +, -, / e parênteses.\nEx: ((5d10x61000)x2)x20');
            return;
        }

        let rollsLog = [];
        let stringCalculo = expressao;

        expressao = expressao.replace(/(\d+)d(\d+)/g, (match, qtdStr, facesStr) => {
            const qtd = parseInt(qtdStr);
            const faces = parseInt(facesStr);
            let soma = 0;
            let resultados = [];
            const qtdSegura = Math.min(qtd, 1000); 
            
            for (let i = 0; i < qtdSegura; i++) {
                const r = Math.floor(Math.random() * faces) + 1;
                soma += r;
                resultados.push(r);
            }
            
            const logDados = resultados.length <= 30 
                ? `[${resultados.join(', ')}]` 
                : `[${resultados.slice(0, 30).join(', ')}... e mais ${resultados.length - 30}]`;
                
            rollsLog.push(`${qtdSegura}d${faces}: ${logDados} = ${soma}`);
            stringCalculo = stringCalculo.replace(match, `<span style="color:#00ffcc; font-weight:bold;">${soma}</span>`);
            return soma;
        });

        try {
            const resultadoFinal = new Function('return ' + expressao)();
            
            if (isNaN(resultadoFinal) || !isFinite(resultadoFinal)) throw new Error("Cálculo infinito");

            const letalExtra = parseInt(letalAtiva) || 0;
            
            // 🔥 CORREÇÃO: Leitura de Notação Científica para Dano Astronômico 🔥
            let digitosGerais = 0;
            const strNum = String(Math.floor(Math.abs(resultadoFinal)));
            if (strNum.includes('e')) {
                const parts = strNum.split('e');
                digitosGerais = parseInt(parts[1].replace('+', '')) + 1;
            } else {
                digitosGerais = strNum.length;
            }

            const letalidadePorTamanho = Math.max(0, digitosGerais - 8);
            const danoReduzido = letalidadePorTamanho > 0 
                ? Math.floor(resultadoFinal / Math.pow(10, letalidadePorTamanho)) 
                : Math.floor(resultadoFinal);

            const letalidadeCalculada = letalidadePorTamanho + letalExtra;

            const percNum = parseFloat(custoAtiva) || 0;
            let logEnergia = '';
            if (tipoAtiva && tipoAtiva !== 'nenhum' && percNum > 0) {
                // 🔥 CORREÇÃO (6ª rodada, mesma causa de PoderesFormContext.jsx > dispararAtaque):
                // usava o máximo BRUTO (getMaximo) pra calcular o %, mas subtraía do "atual" já
                // guardado na escala comprimida — dreno gigantesco e desproporcional. Agora usa
                // getVitalMxDisplay (mesma escala do "atual").
                const maxEnergia = getVitalMxDisplay(tipoAtiva, minhaFicha) || 0;
                const custoCalculado = Math.floor((maxEnergia * percNum) / 100);

                updateFicha(ficha => {
                    if (ficha[tipoAtiva]) {
                        ficha[tipoAtiva].atual = Math.max(0, (ficha[tipoAtiva].atual || 0) - custoCalculado);
                    }
                });
                salvarFichaSilencioso();
                logEnergia = `⚡ Consumiu ${percNum}% de ${tipoAtiva.toUpperCase()} (${custoCalculado.toLocaleString('pt-BR')} pts)`;
            }

            let detalheConta = `<div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.4); border-radius: 5px; border-left: 4px solid #ff00ff; font-family: monospace; font-size: 0.95em; color: #ccc;">`;
            detalheConta += `<strong style="color:#ff00ff; font-size:1.1em; letter-spacing:1px;">[ CÁLCULO MANUAL LIVRE ]</strong><br/><br/>`;
            detalheConta += `<strong>Fórmula Original:</strong> <span style="color:#fff">${formAtiva}</span><br/><br/>`;
            
            if (rollsLog.length > 0) {
                detalheConta += `<strong>🎲 Dados Rolados:</strong><br/>${rollsLog.join('<br/>')}<br/><br/>`;
            }
            
            detalheConta += `<strong>Dano Bruto Calculado:</strong> ${resultadoFinal.toLocaleString('pt-BR')}<br/>`;
            detalheConta += `<strong>Cálculo:</strong> ${stringCalculo} = <strong style="color:#ff003c; font-size:1.2em;">${resultadoFinal.toLocaleString('pt-BR')}</strong>`;
            if (logEnergia) {
                detalheConta += `<br/><br/><span style="color:#00ffcc; font-weight:bold;">${logEnergia} debitado diretamente da ficha!</span>`;
            }
            detalheConta += `</div>`;

            let extraFeed = {};
            if (dummieAlvo && alvoSelecionado) {
                const hpAnterior = dummieAlvo.hpAtual;
                const novoHp = Math.max(0, hpAnterior - danoReduzido);
                salvarDummie(alvoSelecionado, { ...dummieAlvo, hpAtual: novoHp });
                extraFeed = { alvoNome: dummieAlvo.nome, alvoSobreviveu: novoHp > 0, overkill: danoReduzido > hpAnterior ? danoReduzido - hpAnterior : 0 };
            }

            const feedData = {
                tipo: 'dano', nome: meuNome, dano: Math.floor(danoReduzido), letalidade: letalidadeCalculada, 
                rolagem: `${rollsLog.length > 0 ? rollsLog.length + ' rolagem(ns)' : 'Cálculo Direto'}`, rolagemMagica: "",
                atributosUsados: 'Manual', detalheEnergia: logEnergia ? `(${logEnergia})` : '',
                armaStr: ' (Fórmula Livre)', detalheConta: detalheConta,
                elemento: elementoAtivo,
                ...extraFeed
            };

            enviarParaFeed(feedData);
            // 🔥 Só força a troca pra aba do Log se quem rolou não estiver já no Mapa — lá o
            // resultado já aparece ao vivo na Moldura de combate (MapaHologramaAcao), então
            // arrancar o jogador pro Log no meio de um combate no Mapa (ver
            // MapaCombate.jsx > MapaAtaquesSalvos, que reusa esta MESMA função pra rolar
            // fórmulas salvas direto do Mapa) seria uma navegação indesejada.
            if (abaAtiva !== 'aba-mapa') setAbaAtiva('aba-log');
            if (formulaOverride === undefined) { setCustomFormula(''); }
        } catch (e) {
            alert('Erro ao calcular a fórmula matemática. Verifique se os parênteses fecham corretamente.');
        }
    }, [customFormula, customLetalidade, customEnergiaTipo, customEnergiaCusto, meuNome, dummieAlvo, alvoSelecionado, setAbaAtiva, abaAtiva, updateFicha, minhaFicha, elementoAtivo]);

    const rolarDano = useCallback(() => {
        salvarConfigAtaque();

        const elementosInatos = [];
        (minhaFicha.poderes || []).forEach(p => {
            if (p.ativa && (p.vertente || '').toLowerCase().includes('elemental') && p.elemento) {
                elementosInatos.push(p.elemento.toLowerCase().trim());
            }
        });
        const h = minhaFicha.hierarquia || {};
        if (h.poder && (h.poderVertente || '').toLowerCase().includes('elemental') && h.poderElemento) {
            elementosInatos.push(h.poderElemento.toLowerCase().trim());
        }
        if (h.infinity && (h.infinityVertente || '').toLowerCase().includes('elemental') && h.infinityElemento) {
            elementosInatos.push(h.infinityElemento.toLowerCase().trim());
        }

        const configHabilidades = poderesAtivos.map(p => ({
            id: p.id, nome: p.nome, dadosQtd: p.dadosQtd || 0, dadosFaces: p.dadosFaces || 20, custoPercentual: p.custoPercentual || 0,
            armaVinculada: p.armaVinculada || '', statusUsados: skillConfigs[p.id]?.statusUsados || p.statusUsados || ['forca'],
            energiaCombustao: skillConfigs[p.id]?.energiaCombustao || p.energiaCombustao || 'mana', efeitos: p.efeitos || [],
            vertente: p.vertente || '', elemento: p.elemento || '' 
        }));

        const configMagias = magiasOfensivas.map(m => {
            const efs = [];
            if (m.bonusTipo && m.bonusTipo !== 'nenhum') efs.push({ atributo: 'todos_status', propriedade: m.bonusTipo, valor: m.bonusValor });
            const isInato = elementosInatos.includes((m.elemento || 'Neutro').toLowerCase().trim());
            
            return {
                id: m.id, nome: m.nome, dadosQtd: m.dadosExtraQtd || 0, dadosFaces: m.dadosExtraFaces || 20, custoPercentual: m.custoValor || 0,
                armaVinculada: '', statusUsados: skillConfigs[m.id]?.statusUsados || m.statusUsados || ['inteligencia'],
                energiaCombustao: skillConfigs[m.id]?.energiaCombustao || m.energiaCombustao || 'mana', efeitos: efs,
                vertente: isInato ? 'elemental' : 'magia', elemento: m.elemento || 'Neutro'
            };
        });

        const todasHabilidades = configHabilidades.concat(configMagias);
        const configArma = { statusUsados: armaStatusUsados, energiaCombustao: armaEnergiaCombustao, percEnergia: parseFloat(armaPercEnergia) || 0 };
        const isCriticoNormal = forcarCritNormal || autoCritNormal; const isCriticoFatal = forcarCritFatal || autoCritFatal;

        const result = calcularDano({ minhaFicha, configArma, configHabilidades: todasHabilidades, itensEquipados: (minhaFicha.inventario || []).filter(i => i.equipado), isCriticoNormal, isCriticoFatal });

        if (result.erro) { alert(result.erro); return; }

        if (result.drenos) {
            updateFicha((ficha) => { for (let i = 0; i < result.drenos.length; i++) { if (ficha[result.drenos[i].key]) { ficha[result.drenos[i].key].atual -= result.drenos[i].valor; } } });
            salvarFichaSilencioso();
        }

        setForcarCritNormal(false); setForcarCritFatal(false); setIgnorarTravaAcerto(false);

        const meuUltimoAcerto = [...feedCombate].reverse().find(f => f.nome === meuNome && f.tipo === 'acerto');
        let extraFeed = {};
        let textoAlvos = "";

        if (meuUltimoAcerto && meuUltimoAcerto.alvosArea && meuUltimoAcerto.alvosArea.length > 0) {
            let atingidos = 0;
            meuUltimoAcerto.alvosArea.forEach(alvoHit => {
                if (alvoHit.acertou) {
                    atingidos++;
                    const dummieEntry = Object.entries(dummies).find(([id, d]) => d.nome === alvoHit.nome);
                    if (dummieEntry) {
                        const [idD, dData] = dummieEntry;
                        salvarDummie(idD, { ...dData, hpAtual: Math.max(0, dData.hpAtual - result.dano) });
                    }
                }
            });
            textoAlvos = `<br/><span style="color:#0f0; font-weight:bold;">💥 Dano em Área aplicado a ${atingidos} alvo(s) que falharam na defesa!</span>`;
        } else if (dummieAlvo) {
            const hpAnterior = dummieAlvo.hpAtual;
            const novoHp = Math.max(0, hpAnterior - result.dano);
            salvarDummie(alvoSelecionado, { ...dummieAlvo, hpAtual: novoHp });
            extraFeed = { alvoNome: dummieAlvo.nome, alvoSobreviveu: novoHp > 0, overkill: result.dano > hpAnterior ? result.dano - hpAnterior : 0 };
        }

        if (meuUltimoAcerto && meuUltimoAcerto.zonaIdGerada) {
            const cenarioAtual = useStore.getState().cenario;
            if (cenarioAtual?.zonas) {
                const novoCenario = JSON.parse(JSON.stringify(cenarioAtual));
                const zRef = novoCenario.zonas.find(z => z.id === meuUltimoAcerto.zonaIdGerada);
                if (zRef) {
                    const buffsAtuais = getBuffs(minhaFicha);
                    const furiaM = multiplicadorFuriaVisor > 0 ? multiplicadorFuriaVisor : 1;
                    const multOrig = (buffsAtuais?.mbase || 1) * (buffsAtuais?.mgeral || 1) * (buffsAtuais?.mformas || 1) * (buffsAtuais?.mabs || 1) * furiaM;

                    let keysUsadas = [];
                    todasHabilidades.forEach(h => { if(h.statusUsados) keysUsadas.push(...h.statusUsados); });
                    if (configArma?.statusUsados) keysUsadas.push(...configArma.statusUsados);
                    keysUsadas = [...new Set(keysUsadas)];
                    zRef.statusKeys = keysUsadas;

                    let somaStatusOriginal = 0;
                    keysUsadas.forEach(k => {
                        const str = String(minhaFicha[k]?.base || '').replace(/[^0-9]/g, '');
                        somaStatusOriginal += parseInt(str.substring(0, 2), 10) || 0;
                    });
                    zRef.somaStatusOriginal = somaStatusOriginal;

                    let danoBrutoOrig = 0;
                    let letalidadeBuffsOrig = 0;
                    const scanBruto = (efs) => {
                        (efs || []).forEach(e => {
                            if (!e) return;
                            const prop = (e.propriedade || '').toLowerCase().trim();
                            if (prop === 'dano_bruto' || prop === 'dano_verdadeiro') danoBrutoOrig += parseFloat(e.valor) || 0;
                            if (prop === 'letalidade') letalidadeBuffsOrig += parseFloat(e.valor) || 0;
                        });
                    };
                    (minhaFicha.poderes || []).forEach(p => { if (p.ativa) scanBruto(p.efeitos); scanBruto(p.efeitosPassivos); });
                    (minhaFicha.inventario || []).forEach(i => { if (i.equipado) { scanBruto(i.efeitos); scanBruto(i.efeitosPassivos); } });
                    (minhaFicha.passivas || []).forEach(p => scanBruto(p.efeitos));
                    
                    zRef.danoBrutoOriginal = danoBrutoOrig;
                    zRef.letalidadeOriginalBuffs = letalidadeBuffsOrig;

                    zRef.danoOriginal = result.dano;
                    zRef.letalidadeOriginal = result.letalidade || 0; 
                    zRef.multiplicadorOriginal = multOrig === 0 ? 1 : multOrig;
                    zRef.danoAplicado = result.dano;
                    
                    salvarCenarioCompleto(novoCenario);
                    textoAlvos += `<br/><span style="color:#ff00ff; font-weight:bold;">🌪️ A Zona de Efeito absorveu o poder e castigará quem permanecer lá!</span>`;
                }
            }
        }

        const feedData = {
            tipo: 'dano', nome: meuNome, dano: result.dano, letalidade: result.letalidade,
            rolagem: result.rolagem, rolagemMagica: result.rolagemMagica,
            atributosUsados: result.atributosUsados, detalheEnergia: result.detalheEnergia,
            armaStr: result.armaStr, detalheConta: result.detalheConta + textoAlvos,
            elemento: elementoAtivo, 
            ...extraFeed
        };

        enviarParaFeed(feedData);
        setAbaAtiva('aba-log');
    }, [
        updateFicha, armaStatusUsados, armaEnergiaCombustao, armaPercEnergia,
        critNormalMin, critNormalMax, critFatalMin, critFatalMax, skillConfigs,
        minhaFicha, forcarCritNormal, autoCritNormal, forcarCritFatal, autoCritFatal,
        dummieAlvo, alvoSelecionado, meuNome, setAbaAtiva, poderesAtivos, magiasOfensivas, feedCombate, dummies, multiplicadorFuriaVisor, elementoAtivo
    ]);

    const value = useMemo(() => ({
        armaStatusUsados, setArmStatusUsados: setArmaStatusUsados, armaEnergiaCombustao, setArmaEnergiaCombustao,
        armaPercEnergia, setArmaPercEnergia, critNormalMin, setCritNormalMin, critNormalMax, setCritNormalMax,
        critFatalMin, setCritFatalMin, critFatalMax, setCritFatalMax, autoCritNormal, autoCritFatal,
        forcarCritNormal, setForcarCritNormal, forcarCritFatal, setForcarCritFatal,
        ignorarTravaAcerto, setIgnorarTravaAcerto, skillConfigs, podeRolarDano, furiaAcalmadaMsg,
        multiplicadorFuriaClasse, multiplicadorFuriaVisor, percAtualLostFloor, percEfetivoParaDisplay,
        dummieAlvo, armaEquipada, poderesAtivos, magiasOfensivas, minhaFicha,
        elementoAtivo, setElementoAtivo, elementosDinamicos, 
        customFormula, setCustomFormula, customLetalidade, setCustomLetalidade, 
        customEnergiaTipo, setCustomEnergiaTipo, customEnergiaCusto, setCustomEnergiaCusto,
        rolarDanoCustomizado, salvarFormula, deletarFormula,
        acalmarFuria, updateSkillConfig, toggleSkillStat, toggleArmaStat, salvarConfigAtaque, rolarDano,
    }), [
        armaStatusUsados, armaEnergiaCombustao, armaPercEnergia, critNormalMin, critNormalMax, critFatalMin, critFatalMax,
        autoCritNormal, autoCritFatal, forcarCritNormal, forcarCritFatal, ignorarTravaAcerto, skillConfigs, podeRolarDano, furiaAcalmadaMsg,
        multiplicadorFuriaClasse, multiplicadorFuriaVisor, percAtualLostFloor, percEfetivoParaDisplay,
        dummieAlvo, armaEquipada, poderesAtivos, magiasOfensivas, minhaFicha, elementoAtivo, elementosDinamicos,
        customFormula, customLetalidade, customEnergiaTipo, customEnergiaCusto, rolarDanoCustomizado, salvarFormula, deletarFormula,
        acalmarFuria, updateSkillConfig, toggleSkillStat, toggleArmaStat, salvarConfigAtaque, rolarDano,
    ]);

    return <AtaqueFormContext.Provider value={value}>{children}</AtaqueFormContext.Provider>;
}