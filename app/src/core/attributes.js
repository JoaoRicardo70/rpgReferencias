import useStore from '../stores/useStore';
import { isFisico, isEnergia, tratarUnico } from './utils.js';
import { resolverEfeitosEntidade } from './efeitos-resolver.js';

export function getEfeitosDeClasse(ficha) {
    let classeHeroica = (ficha.bio && ficha.bio.classe) ? String(ficha.bio.classe).toLowerCase() : '';
    let subClasse = (ficha.bio && ficha.bio.subClasse) ? String(ficha.bio.subClasse).toLowerCase() : '';

    if (!classeHeroica) return [];

    let state = useStore.getState();
    let mestreOverrides = {};
    
    if (state.isMestre && state.minhaFicha?.compendioOverrides) {
        mestreOverrides = state.minhaFicha.compendioOverrides;
    } else if (state.personagens) {
        for (let k of Object.keys(state.personagens)) {
            if (state.personagens[k]?.compendioOverrides) {
                mestreOverrides = state.personagens[k].compendioOverrides;
                break;
            }
        }
    }

    let efeitos = [];
    let classesRegistradas = mestreOverrides.classes || {};

    let classData = classesRegistradas[classeHeroica];
    if (classData && classData.efeitosMatematicos) {
        efeitos = [...classData.efeitosMatematicos];
    }

    if ((classeHeroica === 'alterego' || classeHeroica === 'pretender') && subClasse) {
        let subClassData = classesRegistradas[subClasse];
        if (subClassData && subClassData.efeitosMatematicos) {
            efeitos = [...efeitos, ...subClassData.efeitosMatematicos];
        }
    }
    
    return efeitos;
}

export function getBuffs(ficha, statKey, ignorarPassivas = false, avoidLoop = false, ignorarPoderes = false) {
    let buffs = { base: 0, mbase: 0, mgeral: 0, mformas: 0, mabs: 0, munico: [], reducaoCusto: 0, regeneracao: 0, fontesMgeral: [] };
    let hasBuff = { mbase: false, mgeral: false, mformas: false, mabs: false };

    if (!ficha || !statKey) {
        buffs.mbase = 1.0; buffs.mgeral = 1.0; buffs.mformas = 1.0; buffs.mabs = 1.0;
        buffs._hasBuff = hasBuff;
        return buffs;
    }

    let sK = String(statKey).toLowerCase();
    let isStatFisico = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaesp', 'carisma', 'stamina', 'constituicao'].includes(sK);
    let isStatEnergia = ['mana', 'aura', 'chakra', 'corpo'].includes(sK);

    let maxFuriaVal = 0; 

    const processarEfeitos = (efeitos, origemNome) => {
        if (!efeitos) return;
        for (let j = 0; j < efeitos.length; j++) {
            let e = efeitos[j];
            if (!e) continue;
            let prop = (e.propriedade || '').toLowerCase();
            let atr = (e.atributo || '').toLowerCase();
            let val = parseFloat(e.valor);
            
            if (isNaN(val)) val = prop.startsWith('m') ? 1.0 : 0;

            let afeta = (atr === sK) ||
                (atr === 'todos_status' && (isStatFisico || sK === 'status')) ||
                (atr === 'todas_energias' && isStatEnergia) ||
                (atr === 'geral') ||
                (atr === 'dano' && sK === 'dano');

            if (afeta) {
                if (prop === 'furia_berserker') {
                    if (val > maxFuriaVal) maxFuriaVal = val;
                }
                else if (prop === 'base') buffs.base += val;
                else if (prop === 'mbase') { buffs.mbase += val; hasBuff.mbase = true; }
                else if (prop === 'mgeral') { 
                    buffs.mgeral += val; 
                    hasBuff.mgeral = true; 
                    buffs.fontesMgeral.push(`[${origemNome}] +${val}x`); 
                }
                else if (prop === 'mformas') { buffs.mformas += val; hasBuff.mformas = true; }
                else if (prop === 'mabs') { buffs.mabs += val; hasBuff.mabs = true; }
                else if (prop === 'munico') buffs.munico.push(val);
                else if (prop === 'reducaocusto') buffs.reducaoCusto += val;
                else if (prop === 'regeneracao') buffs.regeneracao += val;
            }
        }
    };

    if (!ignorarPoderes && ficha.poderes) {
        for (let i = 0; i < ficha.poderes.length; i++) {
            let p = ficha.poderes[i];
            if (!p) continue;
            let resolved = resolverEfeitosEntidade(p);
            if (p.ativa) processarEfeitos(resolved.efeitos, `Poder: ${p.nome}`);
            processarEfeitos(resolved.efeitosPassivos, `Poder(Pass): ${p.nome}`);
        }
    }

    if (ficha.inventario) {
        for (let i = 0; i < ficha.inventario.length; i++) {
            let item = ficha.inventario[i];
            if (item && item.equipado) {
                let applyBase = true;
                let activeForm = null;

                if (item.formaAtivaId && item.formas) {
                    activeForm = item.formas.find(f => f.id === item.formaAtivaId);
                    if (activeForm && activeForm.acumulaFormaBase === false) {
                        applyBase = false;
                    }
                }

                if (applyBase) {
                    if (item.efeitos) processarEfeitos(item.efeitos, `Item: ${item.nome}`);
                    if (item.efeitosPassivos) processarEfeitos(item.efeitosPassivos, `Item(Pass): ${item.nome}`);
                }

                if (activeForm) {
                    let activeConfig = null;
                    if (item.configAtivaId) {
                        activeConfig = (activeForm.configs || []).find(c => c.id === item.configAtivaId);
                    }
                    if (!activeConfig && activeForm.configs && activeForm.configs.length > 0) {
                        activeConfig = activeForm.configs[0];
                    }

                    if (activeConfig) {
                        if (activeConfig.efeitos) processarEfeitos(activeConfig.efeitos, `[Bankai] ${activeForm.nome || ''} - ${activeConfig.nome || ''}`);
                        if (activeConfig.efeitosPassivos) processarEfeitos(activeConfig.efeitosPassivos, `[Bankai Passivo] ${activeForm.nome || ''} - ${activeConfig.nome || ''}`);
                    } else {
                        if (activeForm.efeitos) processarEfeitos(activeForm.efeitos, `[Bankai] ${activeForm.nome || ''}`);
                        if (activeForm.efeitosPassivos) processarEfeitos(activeForm.efeitosPassivos, `[Bankai Passivo] ${activeForm.nome || ''}`);
                    }
                }
            }
        }
    }

    // 🔥 LER OS SERES SELADOS E AS SUAS FORMAS 🔥
    if (ficha.seresSelados) {
        for (let i = 0; i < ficha.seresSelados.length; i++) {
            let ser = ficha.seresSelados[i];
            if (ser && ser.ativo) {
                let resolved = resolverEfeitosEntidade(ser);
                if (resolved.efeitos) processarEfeitos(resolved.efeitos, `[Pacto] ${ser.nome}`);
                if (resolved.efeitosPassivos) processarEfeitos(resolved.efeitosPassivos, `[Pacto Passivo] ${ser.nome}`);

                // Lê as Formas do Ser Selado (Modos de Jinchuuriki/Sincronização)
                if (ser.formaAtivaId && ser.formas) {
                    let activeForm = ser.formas.find(f => f.id === ser.formaAtivaId);
                    if (activeForm) {
                        let activeConfig = null;
                        if (ser.configAtivaId) {
                            activeConfig = (activeForm.configs || []).find(c => c.id === ser.configAtivaId);
                        }
                        if (!activeConfig && activeForm.configs && activeForm.configs.length > 0) {
                            activeConfig = activeForm.configs[0];
                        }

                        if (activeConfig) {
                            if (activeConfig.efeitos) processarEfeitos(activeConfig.efeitos, `[Forma Entidade] ${activeForm.nome || ''} - ${activeConfig.nome || ''}`);
                            if (activeConfig.efeitosPassivos) processarEfeitos(activeConfig.efeitosPassivos, `[Forma Entidade Passiva] ${activeForm.nome || ''} - ${activeConfig.nome || ''}`);
                        } else {
                            if (activeForm.efeitos) processarEfeitos(activeForm.efeitos, `[Forma Entidade] ${activeForm.nome || ''}`);
                            if (activeForm.efeitosPassivos) processarEfeitos(activeForm.efeitosPassivos, `[Forma Entidade Passiva] ${activeForm.nome || ''}`);
                        }
                    }
                }
            }
        }
    }

    if (!ignorarPassivas && ficha.passivas) {
        for (let i = 0; i < ficha.passivas.length; i++) {
            let p = ficha.passivas[i];
            if (p && p.efeitos) processarEfeitos(p.efeitos, `Passiva: ${p.nome}`);
        }
    }

    processarEfeitos(getEfeitosDeClasse(ficha), `Classe Mística`);

    if (maxFuriaVal > 0 && !avoidLoop) {
        // 🩸 Vida pode ter várias "Break Bars" (ver core/vitals.js > getTetoVida/calcularBarrasVida),
        // mas o TOTAL de Vida (soma de todas as barras) é SEMPRE igual ao máximo ESTÁVEL bruto (sem
        // Formas, pra uma Forma temporária nunca fazer surgir/sumir uma barra sozinha) — a mecânica
        // de barras só reparte visualmente esse total, nunca o infla. A fração perdida pra Fúria
        // Berserker precisa considerar esse TOTAL, senão a barra da frente vazia já contaria como
        // "quase morto" mesmo com reservas cheias sobrando.
        let maxVida = getMaximoSemFormas(ficha, 'vida', true) || 0;
        let atualVida = ficha.vida?.atual ?? maxVida;

        let percLost = maxVida > 0 ? Math.max(0, ((maxVida - atualVida) / maxVida) * 100) : 0;
        
        let furiaMax = (ficha.combate && ficha.combate.furiaMax) !== undefined 
                        ? parseFloat(ficha.combate.furiaMax) 
                        : 0;
                        
        let percEfetivo = Math.floor(Math.max(percLost, furiaMax));
        
        let multiplicadorGanho = 0;
        if (percEfetivo === 1) {
            multiplicadorGanho = maxFuriaVal; 
        } else if (percEfetivo >= 2) {
            multiplicadorGanho = percEfetivo; 
        }
        
        buffs.mgeral += multiplicadorGanho;
        if (multiplicadorGanho > 0) {
            hasBuff.mgeral = true;
            buffs.fontesMgeral.push(`[Fúria Berserker] +${multiplicadorGanho}x`); 
        }
    }

    if (!hasBuff.mbase) buffs.mbase = 1.0;
    if (!hasBuff.mgeral) buffs.mgeral = 1.0;
    if (!hasBuff.mformas) buffs.mformas = 1.0;
    if (!hasBuff.mabs) buffs.mabs = 1.0;

    buffs._hasBuff = hasBuff;
    return buffs;
}

export function getPoderesDefesa(ficha, tipo) {
    let t = 0;
    if (!ficha) return 0;
    
    if (ficha.poderes) {
        for (let i = 0; i < ficha.poderes.length; i++) {
            let p = ficha.poderes[i];
            if (p && p.ativa) {
                let resolved = resolverEfeitosEntidade(p);
                for (let j = 0; j < resolved.efeitos.length; j++) {
                    if (resolved.efeitos[j] && (resolved.efeitos[j].propriedade || '').toLowerCase() === tipo) {
                        t += (parseFloat(resolved.efeitos[j].valor) || 0);
                    }
                }
            }
        }
    }

    if (ficha.seresSelados) {
        for (let i = 0; i < ficha.seresSelados.length; i++) {
            let ser = ficha.seresSelados[i];
            if (ser && ser.ativo) {
                let resolved = resolverEfeitosEntidade(ser);
                for (let j = 0; j < resolved.efeitos.length; j++) {
                    if (resolved.efeitos[j] && (resolved.efeitos[j].propriedade || '').toLowerCase() === tipo) {
                        t += (parseFloat(resolved.efeitos[j].valor) || 0);
                    }
                }
                if (ser.formaAtivaId && ser.formas) {
                    let activeForm = ser.formas.find(f => f.id === ser.formaAtivaId);
                    if (activeForm && activeForm.efeitos) {
                        for (let j = 0; j < activeForm.efeitos.length; j++) {
                            if (activeForm.efeitos[j] && (activeForm.efeitos[j].propriedade || '').toLowerCase() === tipo) {
                                t += (parseFloat(activeForm.efeitos[j].valor) || 0);
                            }
                        }
                    }
                }
            }
        }
    }
    
    let efeitosClasse = getEfeitosDeClasse(ficha);
    for (let j = 0; j < efeitosClasse.length; j++) {
        if ((efeitosClasse[j].propriedade || '').toLowerCase() === tipo) {
            t += (parseFloat(efeitosClasse[j].valor) || 0);
        }
    }
    
    return t;
}

export function getPoderTotalDaAbaPoderes(ficha, statKey) {
    let b = getBuffs(ficha, statKey);
    let mU = 1.0;
    for (let i = 0; i < b.munico.length; i++) mU *= b.munico[i];

    let mB = b._hasBuff.mbase ? b.mbase : 1.0;
    let mG = b._hasBuff.mgeral ? b.mgeral : 1.0;
    let mF = b._hasBuff.mformas ? b.mformas : 1.0;
    let mA = b._hasBuff.mabs ? b.mabs : 1.0;

    return mB * mG * mF * mA * mU;
}

export function isStatBuffed(ficha, statKey) {
    if (statKey === 'status') {
        let sFisicos = ['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaEsp', 'carisma', 'stamina', 'constituicao'];
        for (let i = 0; i < sFisicos.length; i++) {
            if (getPoderTotalDaAbaPoderes(ficha, sFisicos[i]) > 1.0) return true;
        }
        return false;
    } else {
        return getPoderTotalDaAbaPoderes(ficha, statKey) > 1.0;
    }
}

// 🔥 Sanitização de segurança: strings vindas de campos formatados (ex: "260.000.000",
// com pontos como separador de milhar) truncam no parseFloat no primeiro ponto extra.
// Números já limpos (type number) passam direto, sem qualquer conversão.
function sanitizarBaseNumerica(valor) {
    if (typeof valor === 'number') return valor;
    if (valor === null || valor === undefined || valor === '') return 0;
    const limpo = parseInt(String(valor).replace(/\./g, ''), 10);
    return isNaN(limpo) ? 0 : limpo;
}

export function getRawBase(ficha, statKey) {
    if (!ficha || !statKey) return 0;
    let s = ficha[statKey];
    return (s && s.base) ? sanitizarBaseNumerica(s.base) : 0;
}

export function getEfetivoBase(ficha, statKey, avoidLoop = false, buffsCache = null) {
    let rawBase = getRawBase(ficha, statKey);
    if (isNaN(rawBase)) rawBase = 0;
    return rawBase + (buffsCache || getBuffs(ficha, statKey, false, avoidLoop)).base;
}

export function getMultiplicadorTotal(ficha, k, avoidLoop = false, buffsCache = null) {
    if (!ficha || !k) return 1.0;
    let s = ficha[k] || {};
    let b = buffsCache || getBuffs(ficha, k, false, avoidLoop);

    const calcAdd = (fichaVal, buffSum, hasBuffFlag) => {
        let v = parseFloat(fichaVal) || 1.0;
        if (!hasBuffFlag) return v; 
        return (v === 1.0 ? 0 : v) + buffSum; 
    };

    let mB = calcAdd(s.mBase, b.mbase, b._hasBuff.mbase);
    let mG = calcAdd(s.mGeral, b.mgeral, b._hasBuff.mgeral);
    let mF = calcAdd(s.mFormas, b.mformas, b._hasBuff.mformas);
    let mA = calcAdd(s.mAbsoluto, b.mabs, b._hasBuff.mabs);

    let u1 = tratarUnico(s.mUnico || "1.0");
    let uniFicha = 1.0;
    for (let i = 0; i < u1.length; i++) { uniFicha *= u1[i]; }

    let mU = 1.0;
    for (let i = 0; i < b.munico.length; i++) mU *= b.munico[i];

    return mB * mG * mF * mA * uniFicha * mU;
}

export function getMaximo(ficha, k, avoidLoop = false, buffsCache = null) {
    let buffs = buffsCache || getBuffs(ficha, k, false, avoidLoop);
    let b = getEfetivoBase(ficha, k, avoidLoop, buffs);
    let mult = getMultiplicadorTotal(ficha, k, avoidLoop, buffs);
    let mx = Math.floor(b * mult);
    return isNaN(mx) ? 0 : mx;
}

// 🔥 Réplica de getMultiplicadorTotal/getMaximo, só que com o multiplicador de Formas (mF) travado
// em 1.0 — ou seja, "quanto este vital vale SEM nenhuma Forma ativa/temporária" (estático ou via
// buff, tanto faz — ambos entram no mesmo eixo "mformas"). Usada por core/vitals.js pra decidir a
// ESCALA DE NOTAÇÃO de exibição (calcVitalScale) com base só no que é ESTÁVEL do personagem
// (Prestígio, equipamento permanente, etc.), nunca no que uma Forma temporária adiciona — assim
// ativar/desativar uma Forma nunca muda a "casa decimal" que a Ficha usa pra mostrar o número,
// só o valor exibido DENTRO dessa escala (que cresce ou volta ao normal, nunca "pula" de notação
// e aparenta ter encolhido). Ver core/vitals.js > rescalarVitaisProporcional/calcVitalScale.
export function getMultiplicadorTotalSemFormas(ficha, k, avoidLoop = false, buffsCache = null) {
    if (!ficha || !k) return 1.0;
    let s = ficha[k] || {};
    let b = buffsCache || getBuffs(ficha, k, false, avoidLoop);

    const calcAdd = (fichaVal, buffSum, hasBuffFlag) => {
        let v = parseFloat(fichaVal) || 1.0;
        if (!hasBuffFlag) return v;
        return (v === 1.0 ? 0 : v) + buffSum;
    };

    let mB = calcAdd(s.mBase, b.mbase, b._hasBuff.mbase);
    let mG = calcAdd(s.mGeral, b.mgeral, b._hasBuff.mgeral);
    // mF fica de fora de propósito — este é o único ponto de diferença com getMultiplicadorTotal.
    let mA = calcAdd(s.mAbsoluto, b.mabs, b._hasBuff.mabs);

    let u1 = tratarUnico(s.mUnico || "1.0");
    let uniFicha = 1.0;
    for (let i = 0; i < u1.length; i++) { uniFicha *= u1[i]; }

    let mU = 1.0;
    for (let i = 0; i < b.munico.length; i++) mU *= b.munico[i];

    return mB * mG * mA * uniFicha * mU;
}

export function getMaximoSemFormas(ficha, k, avoidLoop = false, buffsCache = null) {
    let buffs = buffsCache || getBuffs(ficha, k, false, avoidLoop);
    let b = getEfetivoBase(ficha, k, avoidLoop, buffs);
    let mult = getMultiplicadorTotalSemFormas(ficha, k, avoidLoop, buffs);
    let mx = Math.floor(b * mult);
    return isNaN(mx) ? 0 : mx;
}