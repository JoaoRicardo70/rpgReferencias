// ==========================================
// ENGINE RPG — Cálculos de combate (dano, acerto, defesa)
// ==========================================
import { contarDigitos, tratarUnico, pegarDoisPrimeirosDigitos } from './utils.js';
import { getMaximo, getBuffs, getRawBase, getPoderesDefesa, getEfeitosDeClasse } from './attributes.js';
import { resolverEfeitosEntidade } from './efeitos-resolver.js';

export function calcularCA(ficha, tipo) {
    if (!ficha) return 10;
    const getDoisDigitos = (valor) => {
        if (!valor) return 0;
        const strVal = String(valor).replace(/[^0-9]/g, '');
        if (!strVal) return 0;
        return parseInt(strVal.substring(0, 2), 10);
    };
    let base = 5;
    if (tipo === 'evasiva') base += getDoisDigitos(ficha.destreza?.base);
    if (tipo === 'resistencia') base += getDoisDigitos(ficha.forca?.base);

    let bonus = 0;
    const somarBonus = (efeitos) => {
        (efeitos || []).forEach(e => {
            if (e && e.atributo === tipo && e.propriedade === 'base') bonus += parseFloat(e.valor) || 0;
        });
    };

    (ficha.poderes || []).forEach(p => {
        let resolved = resolverEfeitosEntidade(p);
        if (p.ativa) somarBonus(resolved.efeitos);
        somarBonus(resolved.efeitosPassivos);
    });
    (ficha.passivas || []).forEach(p => { somarBonus(p.efeitos); });
    (ficha.inventario || []).filter(i => i.equipado).forEach(i => {
        let resolved = resolverEfeitosEntidade(i);
        somarBonus(resolved.efeitos);
        somarBonus(resolved.efeitosPassivos);
    });

    let totalBruto = Math.floor(base + bonus);
    return processarDefesaComCondicoes(ficha, tipo, totalBruto);
}

export function rolarDadosComVantagem(qD, fD, vantagens = 0, desvantagens = 0) {
    let netVantagem = (parseInt(vantagens) || 0) - (parseInt(desvantagens) || 0);
    let totalDice = qD + Math.abs(netVantagem);
    let rolls = [];
    
    for (let i = 0; i < totalDice; i++) {
        rolls.push(Math.floor(Math.random() * fD) + 1);
    }

    let sorted = [...rolls].sort((a, b) => b - a);
    let kept = [];

    if (netVantagem > 0) {
        kept = sorted.slice(0, qD); 
    } else if (netVantagem < 0) {
        kept = sorted.slice(totalDice - qD);
    } else {
        kept = sorted; 
    }

    let sD = 0;
    let finalTexts = [];
    let pool = [...kept]; 

    for (let i = 0; i < rolls.length; i++) {
        let r = rolls[i];
        let idx = pool.indexOf(r);
        if (idx !== -1) {
            pool.splice(idx, 1);
            sD += r;
            finalTexts.push(`<strong>${r}</strong>`);
        } else {
            finalTexts.push(`<strike style="color:#ff003c; opacity:0.7">${r}</strike>`);
        }
    }

    let prefix = netVantagem > 0 ? `<span style="color:#0f0">[VANTAGEM]</span> ` : 
                 netVantagem < 0 ? `<span style="color:#f00">[DESVANTAGEM]</span> ` : ``;
                 
    let rolagemTexto = totalDice <= 30
        ? `${prefix}[${finalTexts.join(', ')}] = 🎲(${sD})`
        : `${prefix}[${finalTexts.slice(0, 30).join(', ')}... e mais ${(totalDice - 30).toLocaleString('pt-BR')} dados] = 🎲(${sD})`;

    return { sD, rolagemTexto };
}

function rolarDadosSimples(qtd, faces) {
    let soma = 0;
    let rolls = [];
    for (let i = 0; i < qtd; i++) {
        let r = Math.floor(Math.random() * faces) + 1;
        soma += r;
        rolls.push(r);
    }
    return { soma, rolls };
}

function formatarRolagem(qtd, faces, rolls, soma) {
    if (rolls.length <= 30) {
        return `${qtd}d${faces}: [${rolls.join(', ')}] = ${soma}`;
    }
    return `${qtd}d${faces}: [${rolls.slice(0, 30).join(', ')}... +${(rolls.length - 30).toLocaleString('pt-BR')} dados] = ${soma}`;
}

function calcularSubDano({ qtdDados, facesDados, sels, combustaoPorEnergia, combustoesMultiplas, minhaFicha, mUnico }) {
    if (qtdDados <= 0) return { dano: 0, rolagem: '', rolagemValor: 0, somaTermos: 0, detalhesTermos: [] };

    let { soma, rolls } = rolarDadosSimples(qtdDados, facesDados);
    let somaTermos = 0;
    let detalhesTermos = [];

    for (let i = 0; i < sels.length; i++) {
        let val = getMaximo(minhaFicha, sels[i]);
        let termo = val * mUnico;
        somaTermos += termo;
        let nomeAttr = (minhaFicha[sels[i]] && minhaFicha[sels[i]].nome) || sels[i].toUpperCase();
        detalhesTermos.push(`<span style="color:#ff003c">${nomeAttr}(${val.toLocaleString('pt-BR')})</span>×Uni(${mUnico})`);
    }

    if (combustaoPorEnergia) {
        let energyKeys = Object.keys(combustaoPorEnergia);
        for (let i = 0; i < energyKeys.length; i++) {
            let key = energyKeys[i];
            let combustao = combustaoPorEnergia[key];
            if (combustao > 0) {
                let termo = combustao * mUnico;
                somaTermos += termo;
                detalhesTermos.push(`<span style="color:#0ff">${key.toUpperCase()}(${combustao.toLocaleString('pt-BR')})</span>×Uni(${mUnico})`);
            }
        }
    }

    if (combustoesMultiplas) {
        let mKeys = Object.keys(combustoesMultiplas);
        for (let i = 0; i < mKeys.length; i++) {
            let key = mKeys[i];
            let combustao = combustoesMultiplas[key];
            if (combustao > 0) {
                let termo = combustao * mUnico;
                somaTermos += termo;
                detalhesTermos.push(`<span style="color:#0ff">${key.toUpperCase()}(${combustao.toLocaleString('pt-BR')})</span>×Uni(${mUnico})`);
            }
        }
    }

    let dano = Math.floor(soma * somaTermos);
    let rolagem = formatarRolagem(qtdDados, facesDados, rolls, soma);

    return { dano, rolagem, rolagemValor: soma, somaTermos, detalhesTermos };
}

export function calcularDano({ minhaFicha, configArma, configHabilidades, itensEquipados, isCriticoNormal, isCriticoFatal }) {
    let iMultDano = 1.0, iDanoBruto = 0, iLetalidade = 0;
    let elementosAtaque = [];
    let nomesArmas = [];
    
    let classeHeroica = (minhaFicha.bio && minhaFicha.bio.classe) ? String(minhaFicha.bio.classe).toLowerCase() : '';
    let modCriticoBaseNormal = 2;
    let modCriticoBaseFatal = 4;
    
    if (classeHeroica === 'archer') iLetalidade += 20; 
    if (classeHeroica === 'assassin') {
        modCriticoBaseNormal = 3; 
        modCriticoBaseFatal = 5;
    }

    itensEquipados.forEach(item => {
        let v = parseFloat(item.bonusValor) || 0;
        if (item.bonusTipo === 'mult_dano') iMultDano *= (v === 0 ? 1 : v);
        if (item.bonusTipo === 'dano_bruto') iDanoBruto += v;
        if (item.bonusTipo === 'letalidade') iLetalidade += Math.floor(v);
        if (item.tipo === 'arma' || item.tipo === 'artefato') {
            if (item.elemento && item.elemento !== 'Neutro') elementosAtaque.push(formatElemSpan(item.elemento));
            nomesArmas.push(item.nome);
        }
    });

    let nomesMagias = [];
    let magiasEquipadas = minhaFicha.ataquesElementais ? minhaFicha.ataquesElementais.filter(e => e.equipado) : [];
    magiasEquipadas.forEach(atk => {
        let v = parseFloat(atk.bonusValor) || 0;
        if (atk.bonusTipo === 'mult_dano' && v > 0) iMultDano *= v;
        if (atk.bonusTipo === 'dano_bruto' && v > 0) iDanoBruto += v;
        if (atk.bonusTipo === 'letalidade' && v > 0) iLetalidade += Math.floor(v);
        if (atk.elemento && atk.elemento !== 'Neutro') elementosAtaque.push(formatElemSpan(atk.elemento));
        nomesMagias.push(atk.nome);
    });

    let fichaD = minhaFicha.dano || {};
    let bDano = getBuffs(minhaFicha, 'dano');

    const calcAdd = (fichaVal, buffSum, hasBuff) => {
        let v = parseFloat(fichaVal) || 1.0;
        if (!hasBuff) return v;
        return (v === 1.0 ? 0 : v) + buffSum;
    };

    let totalBas = calcAdd(fichaD.mBase, bDano.mbase, bDano._hasBuff.mbase);
    let totalGer = calcAdd(fichaD.mGeral, bDano.mgeral, bDano._hasBuff.mgeral);
    let totalFor = calcAdd(fichaD.mFormas, bDano.mformas, bDano._hasBuff.mformas);
    let totalAbs = calcAdd(fichaD.mAbsoluto, bDano.mabs, bDano._hasBuff.mabs);
    let totalPot = parseFloat(fichaD.mPotencial) || 1.0;

    let u1 = tratarUnico(fichaD.mUnico || "1.0");
    let uniTotal = 1.0;
    for (let i = 0; i < u1.length; i++) uniTotal *= u1[i];
    for (let i = 0; i < bDano.munico.length; i++) uniTotal *= bDano.munico[i];

    let drenosPorEnergia = {};
    let drenos = [];
    let custoTxt = [];
    let innateNames = []; 

    function calcularDreno(energiaKey, custoPerc) {
        if (custoPerc <= 0) return { dreno: 0, combustao: 0 };
        let eng = minhaFicha[energiaKey];
        if (!eng) return { dreno: 0, combustao: 0 };
        let bEnergia = getBuffs(minhaFicha, energiaKey);
        let mx = getMaximo(minhaFicha, energiaKey, false, bEnergia);
        let combustao = Math.floor(mx * (custoPerc / 100));
        let redBase = eng.reducaoCusto ? parseFloat(eng.reducaoCusto) : 0;
        let red = Math.min(100, redBase + bEnergia.reducaoCusto);
        let dreno = Math.floor(combustao * (1 - (red / 100)));
        return { dreno, combustao };
    }

    let armaEquipada = itensEquipados.find(i => i.tipo === 'arma');
    let armaCombustao = 0;
    if (armaEquipada && configArma && configArma.percEnergia > 0) {
        let { dreno, combustao } = calcularDreno(configArma.energiaCombustao, configArma.percEnergia);
        armaCombustao = combustao;
        if (dreno > 0) {
            if (!drenosPorEnergia[configArma.energiaCombustao]) drenosPorEnergia[configArma.energiaCombustao] = 0;
            drenosPorEnergia[configArma.energiaCombustao] += dreno;
        }
    }

    let skillCombustoes = {};
    for (let i = 0; i < configHabilidades.length; i++) {
        let hab = configHabilidades[i];
        let isElemental = (hab.vertente || '').toLowerCase().includes('elemental');

        if (hab.custoPercentual > 0) {
            if (isElemental) {
                let pDec = hab.custoPercentual / 100;
                let mMana = minhaFicha.mana?.atual !== undefined ? minhaFicha.mana.atual : getMaximo(minhaFicha, 'mana');
                let mAura = minhaFicha.aura?.atual !== undefined ? minhaFicha.aura.atual : getMaximo(minhaFicha, 'aura');
                let mChakra = minhaFicha.chakra?.atual !== undefined ? minhaFicha.chakra.atual : getMaximo(minhaFicha, 'chakra');

                skillCombustoes[hab.id] = {
                    isElemental: true,
                    combustoesMultiplas: {
                        mana: Math.floor(mMana * pDec),
                        aura: Math.floor(mAura * pDec),
                        chakra: Math.floor(mChakra * pDec)
                    }
                };
                innateNames.push(hab.nome);
            } else {
                let { dreno, combustao } = calcularDreno(hab.energiaCombustao, hab.custoPercentual);
                skillCombustoes[hab.id] = { energia: hab.energiaCombustao, combustao };
                if (dreno > 0) {
                    if (!drenosPorEnergia[hab.energiaCombustao]) drenosPorEnergia[hab.energiaCombustao] = 0;
                    drenosPorEnergia[hab.energiaCombustao] += dreno;
                }
            }
        } else {
            skillCombustoes[hab.id] = { energia: hab.energiaCombustao, combustao: 0 };
        }
    }

    for (let key in drenosPorEnergia) {
        let eng = minhaFicha[key];
        let totalDreno = drenosPorEnergia[key];
        if (totalDreno > 0 && (eng?.atual ?? 0) < totalDreno) {
            return { erro: `Sem ${key.toUpperCase()} suficiente! Custo Total: ${totalDreno.toLocaleString('pt-BR')}` };
        }
        if (totalDreno > 0) {
            drenos.push({ key, valor: totalDreno });
            custoTxt.push(`${totalDreno.toLocaleString('pt-BR')} ${key.toUpperCase()}`);
        }
    }

    if (innateNames.length > 0) {
        custoTxt.push(`<span style="color:#0f0; text-shadow: 0 0 5px #0f0;">ZERO (${innateNames.join(', ')} Inato)</span>`);
    }

    let habsVinculadas = armaEquipada
        ? configHabilidades.filter(h => h.armaVinculada && String(h.armaVinculada) === String(armaEquipada.id))
        : [];
    let habsLivres = configHabilidades.filter(h => {
        if (!h.armaVinculada) return true;
        if (!armaEquipada) return true;
        return String(h.armaVinculada) !== String(armaEquipada.id);
    });

    let resultadoArma = null;
    if (armaEquipada && (armaEquipada.dadosQtd || 0) > 0) {
        let habVincResults = [];
        let somaHabVinc = 0;
        for (let i = 0; i < habsVinculadas.length; i++) {
            let hab = habsVinculadas[i];
            let combData = skillCombustoes[hab.id] || { combustao: 0, energia: 'mana' };
            
            let combustaoPorEnergia = {};
            let combustoesMultiplas = null;
            if (combData.isElemental) {
                combustoesMultiplas = combData.combustoesMultiplas;
            } else if (combData.combustao > 0) {
                combustaoPorEnergia[combData.energia] = combData.combustao;
            }

            let r = calcularSubDano({
                qtdDados: hab.dadosQtd || 0, facesDados: hab.dadosFaces || 20,
                sels: hab.statusUsados || ['forca'], combustaoPorEnergia, combustoesMultiplas,
                minhaFicha, mUnico: uniTotal
            });
            r.nome = hab.nome;
            somaHabVinc += r.dano;
            habVincResults.push(r);
        }

        let { soma: rolagemArma, rolls: rollsArma } = rolarDadosSimples(armaEquipada.dadosQtd, armaEquipada.dadosFaces || 20);
        let somaTermosArma = 0;
        let detalhesArma = [];
        let armaSels = configArma ? configArma.statusUsados || ['forca'] : ['forca'];

        for (let i = 0; i < armaSels.length; i++) {
            let val = getMaximo(minhaFicha, armaSels[i]);
            somaTermosArma += val * uniTotal;
            let nomeAttr = (minhaFicha[armaSels[i]] && minhaFicha[armaSels[i]].nome) || armaSels[i].toUpperCase();
            detalhesArma.push(`<span style="color:#ff003c">${nomeAttr}(${val.toLocaleString('pt-BR')})</span>×Uni(${uniTotal})`);
        }

        if (armaCombustao > 0) {
            somaTermosArma += armaCombustao * uniTotal;
            let engKey = configArma ? configArma.energiaCombustao : 'mana';
            detalhesArma.push(`<span style="color:#0ff">${engKey.toUpperCase()}(${armaCombustao.toLocaleString('pt-BR')})</span>×Uni(${uniTotal})`);
        }

        somaTermosArma += somaHabVinc;
        let danoArma = Math.floor(rolagemArma * somaTermosArma);

        resultadoArma = {
            dano: danoArma,
            rolagem: formatarRolagem(armaEquipada.dadosQtd, armaEquipada.dadosFaces || 20, rollsArma, rolagemArma),
            rolagemValor: rolagemArma, nome: armaEquipada.nome,
            habVincResults, detalhesArma, somaTermosArma, somaHabVinc
        };
    }

    let resultadosHabLivres = [];
    for (let i = 0; i < habsLivres.length; i++) {
        let hab = habsLivres[i];
        if ((hab.dadosQtd || 0) <= 0) continue;

        let combData = skillCombustoes[hab.id] || { combustao: 0, energia: 'mana' };
        
        let combustaoPorEnergia = {};
        let combustoesMultiplas = null;
        if (combData.isElemental) {
            combustoesMultiplas = combData.combustoesMultiplas;
        } else if (combData.combustao > 0) {
            combustaoPorEnergia[combData.energia] = combData.combustao;
        }

        let r = calcularSubDano({
            qtdDados: hab.dadosQtd, facesDados: hab.dadosFaces || 20,
            sels: hab.statusUsados || ['forca'], combustaoPorEnergia, combustoesMultiplas,
            minhaFicha, mUnico: uniTotal
        });
        r.nome = hab.nome;
        resultadosHabLivres.push(r);
    }

    let somaDanos = (resultadoArma ? resultadoArma.dano : 0);
    for (let i = 0; i < resultadosHabLivres.length; i++) somaDanos += resultadosHabLivres[i].dano;
    somaDanos += iDanoBruto;

    if (!resultadoArma && resultadosHabLivres.length === 0 && somaDanos === 0) {
        return { erro: 'Nenhuma fonte de dano! Equipe uma arma com dados ou ative habilidades com dados de dano.' };
    }

    let multCritico = 1;
    let nomeCritico = '';
    if (isCriticoFatal) {
        multCritico = modCriticoBaseFatal;
        nomeCritico = 'CRÍTICO FATAL';
    } else if (isCriticoNormal) {
        multCritico = modCriticoBaseNormal;
        nomeCritico = 'CRÍTICO NORMAL';
    }

    let multTotal = totalBas * totalPot * totalFor * totalGer * totalAbs * uniTotal * iMultDano;
    let multEfetivo = multTotal * multCritico; 
    
    let total = Math.floor(somaDanos * multEfetivo);
    if (isNaN(total)) total = 0;

    // 🔥 CORREÇÃO DE NOTAÇÃO CIENTÍFICA NO MOTOR PRINCIPAL 🔥
    let digitosGerais = contarDigitos(total);

    const letalidadeCalculada = Math.max(0, digitosGerais - 8) + Math.floor(iLetalidade);
    const letalidadePorTamanho = Math.max(0, digitosGerais - 8);

    let danoReduzido = total;
    if (letalidadePorTamanho > 0) {
        danoReduzido = Math.floor(total / Math.pow(10, letalidadePorTamanho));
    } else {
        danoReduzido = Math.floor(total);
    }

    let txtEng = '';
    if (custoTxt.length > 0) {
        let uniqueCustos = [...new Set(custoTxt)];
        txtEng = `<br>Custo de Combustão: <strong style="color:#f0f;">${uniqueCustos.join(' e ')}</strong>`;
    }

    let multArr = [];
    if (totalBas !== 1) multArr.push(`x${totalBas.toFixed(2)}(Bas)`);
    if (totalPot !== 1) multArr.push(`x${totalPot.toFixed(2)}(Pot)`);
    if (totalFor !== 1) multArr.push(`x${totalFor.toFixed(2)}(For)`);
    if (totalGer !== 1) multArr.push(`x${totalGer.toFixed(2)}(Ger)`);
    if (totalAbs !== 1) multArr.push(`x${totalAbs.toFixed(2)}(Abs)`);
    if (uniTotal !== 1) multArr.push(`x${uniTotal.toFixed(2)}(Uni)`);
    if (iMultDano !== 1) multArr.push(`x${iMultDano.toFixed(2)}(Eqp)`);
    if (multCritico > 1) multArr.push(`<span style="color:#ffcc00">x${multCritico}(${nomeCritico})</span>`); 
    let multStr = multArr.length > 0 ? multArr.join(' * ') : 'Nenhum (x1)';

    let detalheLinhas = [`<span style="color:#ffcc00; font-weight:bold;">[MÁQUINA DE CÁLCULO]</span>`];

    if (resultadoArma) {
        let habVincTxt = '';
        if (resultadoArma.habVincResults.length > 0) {
            let habParts = resultadoArma.habVincResults.map(h => `<span style="color:#f0f">${h.nome}(${h.dano.toLocaleString('pt-BR')})</span>`);
            habVincTxt = ` + Habs: ${habParts.join(' + ')}`;
        }
        detalheLinhas.push(`<strong style="color:#0f0">Dano de Arma [${resultadoArma.nome}]:</strong> <span style="color:#0f0">${resultadoArma.rolagem}</span> x (${resultadoArma.detalhesArma.join(' + ')}${habVincTxt}) = <strong style="color:#0f0">${resultadoArma.dano.toLocaleString('pt-BR')}</strong>`);
    }

    for (let i = 0; i < resultadosHabLivres.length; i++) {
        let h = resultadosHabLivres[i];
        detalheLinhas.push(`<strong style="color:#f0f">Dano de Habilidade [${h.nome}]:</strong> <span style="color:#f0f">${h.rolagem}</span> x (${h.detalhesTermos.join(' + ')}) = <strong style="color:#f0f">${h.dano.toLocaleString('pt-BR')}</strong>`);
    }

    detalheLinhas.push(`<strong>Soma:</strong> ${somaDanos.toLocaleString('pt-BR')}${iDanoBruto > 0 ? ` (inclui +${iDanoBruto.toLocaleString('pt-BR')} bruto)` : ''}`);
    detalheLinhas.push(`<strong>Multiplicadores:</strong> ${multStr} = <strong style="color:#fff;">x${multEfetivo % 1 === 0 ? multEfetivo : multEfetivo.toFixed(2)}</strong>`);
    detalheLinhas.push(`<strong>Dano Total:</strong> ${somaDanos.toLocaleString('pt-BR')} x ${multEfetivo % 1 === 0 ? multEfetivo : multEfetivo.toFixed(2)} = <strong style="color:#ff003c; font-size:1.1em;">${total.toLocaleString('pt-BR')}</strong>`);

    let detalheConta = `<div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; border-left: 3px solid #ffcc00; font-family: monospace; font-size: 0.95em; color: #ccc;">
    ${detalheLinhas.join('<br>')}
    </div>`;

    let rolagemTextoFinal = '';
    if (resultadoArma) rolagemTextoFinal += `Arma: ${resultadoArma.rolagem}`;
    for (let i = 0; i < resultadosHabLivres.length; i++) {
        if (rolagemTextoFinal) rolagemTextoFinal += ' | ';
        rolagemTextoFinal += `${resultadosHabLivres[i].nome}: ${resultadosHabLivres[i].rolagem}`;
    }

    let allAttrNames = new Set();
    if (configArma) (configArma.statusUsados || []).forEach(s => allAttrNames.add((minhaFicha[s] && minhaFicha[s].nome) || s.toUpperCase()));
    configHabilidades.forEach(h => (h.statusUsados || []).forEach(s => allAttrNames.add((minhaFicha[s] && minhaFicha[s].nome) || s.toUpperCase())));

    let armaStr = "";
    let combinados = nomesArmas.concat(nomesMagias);
    if (combinados.length) armaStr = ` usando <strong>${combinados.join(' e ')}</strong>`;
    if (elementosAtaque.length) armaStr += ` [${elementosAtaque.join(' / ')}]`;

    if (isCriticoFatal) armaStr += ` 🔥 FATAL 🔥`;
    else if (isCriticoNormal) armaStr += ` ⚡ CRÍTICO ⚡`;

    return {
        dano: danoReduzido, 
        letalidade: letalidadeCalculada,
        rolagem: rolagemTextoFinal || 'Nenhuma rolagem',
        rolagemMagica: "",
        atributosUsados: [...allAttrNames].join(' + '),
        detalheEnergia: txtEng, armaStr,
        detalheConta, drenos, energiaDrenada: true
    };
}

export function calcularAcerto({ qD, fD, prof, bonus, sels, minhaFicha, itensEquipados, vantagens = 0, desvantagens = 0 }) {
    let iAcerto = 0;
    let nomesArmas = [];
    let tiposArmas = []; 

    itensEquipados.forEach(item => {
        if (item.bonusTipo === 'bonus_acerto') iAcerto += (parseFloat(item.bonusValor) || 0);
        if (item.tipo === 'arma' || item.tipo === 'artefato') {
            nomesArmas.push(item.nome);
            let itemStr = String(item.armaTipo || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            tiposArmas.push(itemStr);
        }
    });

    let { sD, rolagemTexto } = rolarDadosComVantagem(qD, fD, vantagens, desvantagens);

    let vSt = 0;
    for (let i = 0; i < sels.length; i++) {
        let baseVal = getRawBase(minhaFicha, sels[i]);
        vSt += pegarDoisPrimeirosDigitos(baseVal);
    }

    let bp = getPoderesDefesa(minhaFicha, 'bonus_acerto');
    
    let bonusProfArma = 0;
    let nomesProfArma = [];
    let efeitosClasse = getEfeitosDeClasse(minhaFicha);
    
    for (let i = 0; i < efeitosClasse.length; i++) {
        let ef = efeitosClasse[i];
        let propNormalizada = (ef.propriedade || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        if (propNormalizada === 'proficiencia_arma') {
            let armaAlvo = (ef.atributo || '').toLowerCase().trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            
            if (tiposArmas.includes(armaAlvo)) {
                bonusProfArma += (parseFloat(ef.valor) || 0);
                if (!nomesProfArma.includes(armaAlvo)) nomesProfArma.push(ef.atributo.trim().toUpperCase());
            }
        }
    }

    let atrNames = [];
    for (let i = 0; i < sels.length; i++) atrNames.push(minhaFicha[sels[i]].nome || sels[i].toUpperCase());

    let armaStr = nomesArmas.length ? ` equipado com <strong>${nomesArmas.join(' e ')}</strong>` : '';

    let profBonusTexto = 'Prof: +' + prof + ' | Bônus Fixo: +' + bonus + 
                         (bp > 0 ? ' | Forma: +' + bp : '') + 
                         (iAcerto > 0 ? ' | Arma: +' + iAcerto : '') +
                         (bonusProfArma > 0 ? ` | Maestria (${nomesProfArma.join(', ')}): +${bonusProfArma}` : '');

    return {
        acertoTotal: Math.floor(vSt + prof + bonus + bp + sD + iAcerto + bonusProfArma), 
        rolagem: rolagemTexto,
        atributosUsados: atrNames.join(' + '),
        profBonusTexto: profBonusTexto,
        armaStr: armaStr
    };
}

export function calcularEvasiva({ prof, bonus, minhaFicha, itensEquipados }) {
    let iEvasiva = 0;
    let nomesArmaduras = [];
    itensEquipados.forEach(item => {
        if (item.bonusTipo === 'bonus_evasiva') iEvasiva += (parseFloat(item.bonusValor) || 0);
        if (item.tipo === 'armadura') nomesArmaduras.push(item.nome);
    });

    let baseVal = getRawBase(minhaFicha, 'destreza');
    let baseD = pegarDoisPrimeirosDigitos(baseVal);
    let bp = getPoderesDefesa(minhaFicha, 'bonus_evasiva');

    let strArmadura = nomesArmaduras.length ? ` equipado com <strong>${nomesArmaduras.join(' e ')}</strong>` : '';

    return {
        total: baseD + prof + bonus + bp + iEvasiva,
        baseCalc: 'Base(Destreza): +' + baseD + ' | Prof: +' + prof + ' | Fixo: +' + bonus + (bp > 0 ? ' | Forma: +' + bp : '') + (iEvasiva > 0 ? ' | Armadura: +' + iEvasiva : ''),
        armaStr: strArmadura
    };
}

export function calcularResistencia({ prof, bonus, minhaFicha, itensEquipados }) {
    let iResistencia = 0;
    let nomesArmaduras = [];
    itensEquipados.forEach(item => {
        if (item.bonusTipo === 'bonus_resistencia') iResistencia += (parseFloat(item.bonusValor) || 0);
        if (item.tipo === 'armadura') nomesArmaduras.push(item.nome);
    });

    let baseVal = getRawBase(minhaFicha, 'forca');
    let baseD = pegarDoisPrimeirosDigitos(baseVal);
    let bp = getPoderesDefesa(minhaFicha, 'bonus_resistencia');

    let strArmadura = nomesArmaduras.length ? ` equipado com <strong>${nomesArmaduras.join(' e ')}</strong>` : '';

    return {
        total: baseD + prof + bonus + bp + iResistencia,
        baseCalc: 'Base(Força): +' + baseD + ' | Prof: +' + prof + ' | Fixo: +' + bonus + (bp > 0 ? ' | Forma: +' + bp : '') + (iResistencia > 0 ? ' | Armadura: +' + iResistencia : ''),
        armaStr: strArmadura
    };
}

export function calcularReducao({ energiaKey, perc, multBase, minhaFicha, itensEquipados, rE }) {
    let iMultEscudo = 0;
    let nomesArmaduras = [];
    itensEquipados.forEach(item => {
        if (item.bonusTipo === 'mult_escudo') iMultEscudo += (parseFloat(item.bonusValor) || 0);
        if (item.tipo === 'armadura') nomesArmaduras.push(item.nome);
    });

    let keys = energiaKey === 'poder' ? ['mana', 'aura', 'chakra'] : [energiaKey];
    let cReal = 0;
    let bBruto = 0;
    let chk = [];

    for (let i = 0; i < keys.length; i++) {
        let e = keys[i];
        let bEnergia = getBuffs(minhaFicha, e);
        let mMax = getMaximo(minhaFicha, e, false, bEnergia);
        let gt = Math.floor(mMax * (perc / 100));
        let redBase = (minhaFicha[e] && minhaFicha[e].reducaoCusto) ? parseFloat(minhaFicha[e].reducaoCusto) : 0;
        let red = Math.min(100, redBase + bEnergia.reducaoCusto);
        let cr = Math.floor(gt * (1 - (red / 100)));
        if ((minhaFicha[e].atual || 0) < cr) return { erro: 'Sem energia!' };
        chk.push({ e: e, cr: cr, bb: gt });
    }

    let drenos = [];
    for (let i = 0; i < chk.length; i++) {
        drenos.push({ key: chk[i].e, valor: chk[i].cr });
        cReal += chk[i].cr;
        bBruto += chk[i].bb;
    }

    let pM = getPoderesDefesa(minhaFicha, 'mult_escudo');
    let multFinal = multBase + pM + iMultEscudo;

    let total = Math.floor(bBruto * multFinal);
    let pVit = Math.max(0, contarDigitos(total) - 8);
    let escRed = pVit > 0 ? Math.floor(total / Math.pow(10, pVit)) : total;
    let nDef = energiaKey === 'poder' ? 'PODER TOTAL' : minhaFicha[energiaKey].nome;

    let strArmadura = nomesArmaduras.length ? ` equipado com <strong>${nomesArmaduras.join(' e ')}</strong>` : '';

    return {
        escudoReduzido: escRed,
        vitalidade: pVit,
        detalhe: 'Drenou ' + perc + '% de ' + nDef + ' (Gasto: ' + cReal.toLocaleString('pt-BR') + ')' + (pM > 0 ? ' | Buff Forma: +' + pM + 'x' : '') + (iMultEscudo > 0 ? ' | Armadura: +' + iMultEscudo + 'x' : ''),
        armaStr: strArmadura,
        drenos: drenos,
        energiaDrenada: true
    };
}

function formatElemSpan(elemento) {
    let cls = 'elem-' + elemento.toLowerCase()
        .replace(/[áàãâä]/g, 'a').replace(/[éèêë]/g, 'e')
        .replace(/[íìîï]/g, 'i').replace(/[óòõôö]/g, 'o')
        .replace(/[úùûü]/g, 'u').replace(/ç/g, 'c')
        .replace(/[\s\/]+/g, '-');
    return `<span class="${cls}">${elemento.toUpperCase()}</span>`;
}
// ==========================================
// 🔥 MOTOR DE CONDIÇÕES E AFINIDADES (INJEÇÃO) 🔥
// ==========================================

export function processarDefesaComCondicoes(ficha, tipoDefesa, caBaseCalculado) {
    if (!ficha || !ficha.condicoes) return caBaseCalculado;
    let caFinal = caBaseCalculado;
    const tem = (id) => ficha.condicoes.some(c => c.id === id);
    const stacks = (id) => { const c = ficha.condicoes.find(x => x.id === id); return c ? c.stacks : 0; };

    if (tipoDefesa === 'evasiva') {
        // Exaustão Nível 5, Imobilizado, Incapacitado ou Petrificado zeram a Evasiva
        if (tem('imobilizado') || tem('incapacitado') || tem('petrificado') || stacks('exausto') >= 5) return 0;
        // Exaustão Nível 2 ou Lento cortam Evasiva pela metade
        if (tem('lento') || stacks('exausto') >= 2 || stacks('criogenia') >= 3) caFinal = Math.floor(caFinal / 2);
    }
    if (tipoDefesa === 'resistencia') {
        // Vulnerável ou muito Queimado cortam a Resistência
        if (tem('vulneravel') || stacks('queimado') >= 4) caFinal = Math.floor(caFinal / 2);
    }
    return caFinal;
}

export function calcularMultiplicadorElemental(ficha, elementoAtaque) {
    if (!ficha || !ficha.afinidades || !elementoAtaque || elementoAtaque === 'fisico') return 1.0;
    const af = ficha.afinidades;
    if (af.imunidades && af.imunidades.includes(elementoAtaque)) return 0.0;
    if (af.vulnerabilidades && af.vulnerabilidades.includes(elementoAtaque)) return 2.0;
    if (af.resistencias && af.resistencias.includes(elementoAtaque)) return 0.5;
    return 1.0;
}

export function calcularEficaciaCura(ficha) {
    if (!ficha) return 1.0;
    
    let multFinal = 1.0; // 100% de eficácia base

    // 1. APLICAR DEBUFFS (Corta-Cura Multiplicativo)
    if (ficha.condicoes) {
        ficha.condicoes.forEach(c => {
            if (c.id === 'sangrando' || c.id === 'queimado' || c.id === 'criogenia') {
                for(let i = 0; i < c.stacks; i++) {
                    multFinal *= 0.5; // Cada stack corta metade do que sobrou
                }
            }
            if (c.id === 'exausto' && c.stacks >= 4) {
                multFinal *= 0.5;
            }
        });
    }

    // 2. APLICAR BUFFS (Poderes, Itens e Classes que aumentam a cura)
    let bonusBuffs = 0;
    const scanCura = (efeitos) => {
        (efeitos || []).forEach(e => {
            if (e && e.propriedade === 'efetividade_cura') {
                bonusBuffs += parseFloat(e.valor) || 0;
            }
        });
    };

    (ficha.poderes || []).forEach(p => { if(p.ativa) scanCura(p.efeitos); scanCura(p.efeitosPassivos); });
    (ficha.inventario || []).forEach(i => { if(i.equipado) { scanCura(i.efeitos); scanCura(i.efeitosPassivos); } });
    (ficha.passivas || []).forEach(p => scanCura(p.efeitos));

    return multFinal * (1 + bonusBuffs);
}