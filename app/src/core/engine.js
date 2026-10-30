// ==========================================
// ENGINE RPG — Cálculos de combate (dano, acerto, defesa)
// ==========================================
import { contarDigitos, pegarDoisPrimeirosDigitos, modificadorDezena } from './utils.js';
import { getMaximo, getBuffs, getRawBase, getPoderesDefesa, getEfeitosDeClasse } from './attributes.js';
import { getVitalMxDisplay } from './vitals.js';
import { ENERGIAS_COMO_PODER, getMargemCusto, limitarPercComoPoder, podeConjurarComoPoder, custoBrutoDeEnergia, somarCustosBrutos } from './custoPoder.js';
import { getVantagensDeClasse, getBonusAcertoDeClasse } from './classesMecanicas.js';
import { resolverEfeitosEntidade } from './efeitos-resolver.js';
import { efeitosDeCombos } from './combos.js';
import { calcularFatorMultiplicadorForca } from './poder.js';

// Status são gravados 1000x maiores que o número exibido na Ficha (core: Marcados.jsx > FATOR_EXIBICAO_STATUS).
const FATOR_EXIBICAO_STATUS = 1000;

// ==========================================
// 👻 O RESET FANTASMA DA ASCENSÃO 👻
// Adiciona o valor oculto da Ascensão a todas as rolagens da Engine!
// ==========================================
export function getPoderDeLutaStatus(ficha, statKey, isRaw = false) {
    let val = isRaw ? getRawBase(ficha, statKey) : getMaximo(ficha, statKey);
    
    const ascBase = parseInt(ficha?.ascensaoBase) || 1;
    const multA = parseFloat(ficha?.multiplicadorForcaAscensao) || 1;
    const ascEfetiva = ascBase * multA;
    
    let bonusAscensao = 0;
    const keyLower = String(statKey).toLowerCase().trim();
    
    if (['forca', 'destreza', 'inteligencia', 'sabedoria', 'energiaesp', 'carisma', 'stamina', 'constituicao'].includes(keyLower)) {
        bonusAscensao = ascEfetiva * 100000; // +100k por Ascensão
    } else if (['mana', 'aura', 'chakra', 'corpo'].includes(keyLower)) {
        bonusAscensao = ascEfetiva * 1000000000; // +1 Bilhão por Ascensão
    } else if (['vida', 'pv', 'pm'].includes(keyLower)) {
        bonusAscensao = ascEfetiva * 100000000; // +100 Milhões por Ascensão
    }
    
    return val + bonusAscensao;
}

export function calcularCA(ficha, tipo) {
    if (!ficha) return 10;
    let base = 5;
    
    // 🔥 Lê o poder verdadeiro (já com a Ascensão)
    if (tipo === 'evasiva') base += pegarDoisPrimeirosDigitos(getPoderDeLutaStatus(ficha, 'destreza', true));
    if (tipo === 'resistencia') base += pegarDoisPrimeirosDigitos(getPoderDeLutaStatus(ficha, 'forca', true));

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
    somarBonus(efeitosDeCombos(ficha)); // 🥋 Combos/Follow Ups (core/combos.js)
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

// ⚖️ Fórmula base do Dano: (soma dos dados das técnicas e/ou armas envolvidas) + (Status relacionados a elas).
// Nada de dado × status. O Custo (energia gasta) não entra aqui: ele aumenta o Poder Calculado só no momento
// do Dano (core/custoPoder.js), e quem ajusta o dano contra o alvo é a Disputa de Poder (core/disputaPoder.js).
// Cada fonte (arma, habilidade vinculada, habilidade livre, técnica) rola os próprios dados; os Status de todas elas
// entram uma vez cada (se duas fontes usam Força, a Força soma uma vez só).
function rolarFonteDeDano({ nome, tipo, qtdDados, facesDados, sels }) {
    const { soma, rolls } = rolarDadosSimples(qtdDados, facesDados);
    return { nome, tipo, soma, rolagem: formatarRolagem(qtdDados, facesDados, rolls, soma), sels: Array.isArray(sels) ? sels : ['forca'] };
}

// Soma os Status distintos das fontes (cada um conta uma vez).
function somarStatusDasFontes(fontes, minhaFicha) {
    const vistos = new Set();
    let soma = 0;
    const detalhes = [];
    fontes.forEach(f => f.sels.forEach(k => {
        if (vistos.has(k)) return;
        vistos.add(k);
        // O Status do dano é o MESMO número que a Ficha Definitiva mostra na coluna Atual (ex.: 240): o valor bruto vem em escala
        // 1000x maior e passa pelo fator de Ascensão/Prestígio (core/poder.js > calcularFatorMultiplicadorForca), igual à exibição.
        const bruto = Number(getMaximo(minhaFicha, k)) || 0;
        const val = Math.floor((bruto * calcularFatorMultiplicadorForca(minhaFicha, 'status')) / FATOR_EXIBICAO_STATUS);
        soma += val;
        const nomeAttr = (minhaFicha[k] && minhaFicha[k].nome) || String(k).toUpperCase();
        detalhes.push(`<span style="color:#ff003c">${nomeAttr}(${val.toLocaleString('pt-BR')})</span>`);
    }));
    return { soma, detalhes };
}

export function calcularDano({ minhaFicha, configArma, configHabilidades, itensEquipados, isCriticoNormal, isCriticoFatal }) {
    let iDanoBruto = 0, iLetalidade = 0;
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
        if (atk.bonusTipo === 'dano_bruto' && v > 0) iDanoBruto += v;
        if (atk.bonusTipo === 'letalidade' && v > 0) iLetalidade += Math.floor(v);
        if (atk.elemento && atk.elemento !== 'Neutro') elementosAtaque.push(formatElemSpan(atk.elemento));
        nomesMagias.push(atk.nome);
    });

    // ⚖️ Multiplicadores de Dano EXTINTOS do dano (pedido do usuário — inflavam demais os números):
    // MBase/MGeral/MFormas/MAbs/MPotencial/MÚnico da aba Dano, os efeitos de DANO/GERAL, a Fúria
    // Berserker e o "Mult Dano" de itens/magias agora só multiplicam o Poder Calculado
    // (core/poder.js > getGlobalMultipliers). O dano contra cada alvo é ajustado depois pela
    // Disputa de Poder (core/disputaPoder.js). Só o Crítico continua multiplicando aqui.

    let drenosPorEnergia = {};
    let drenos = [];
    let custoTxt = [];
    let innateNames = []; 

    function calcularDreno(energiaKey, custoPerc) {
        if (custoPerc <= 0) return { dreno: 0, combustao: 0 };
        let eng = minhaFicha[energiaKey];
        if (!eng) return { dreno: 0, combustao: 0 };
        let bEnergia = getBuffs(minhaFicha, energiaKey);
        // 🔥 CORREÇÃO (mesma causa-raiz das rodadas já resolvidas em PoderesFormContext.jsx >
        // dispararAtaque e AtaqueFormContext.jsx > cálculo manual, ver core/vitals.js >
        // getVitalMxDisplay): "atual" é SEMPRE guardado na escala EXIBIDA/comprimida
        // (calcVitalScale), nunca no valor bruto de getMaximo — usar getMaximo aqui pra tirar o %
        // e depois subtrair o resultado de "atual" causava um dreno gigantesco e desproporcional
        // sempre que o Máximo bruto do personagem já tivesse cruzado uma fronteira de compressão.
        let mx = getVitalMxDisplay(energiaKey, minhaFicha);
        let combustao = Math.floor(mx * (custoPerc / 100));
        let redBase = eng.reducaoCusto ? parseFloat(eng.reducaoCusto) : 0;
        let red = Math.min(100, redBase + bEnergia.reducaoCusto);
        let dreno = Math.floor(combustao * (1 - (red / 100)));
        return { dreno, combustao };
    }

    let armaEquipada = itensEquipados.find(i => i.tipo === 'arma');

    // 🔋 Custos que viram Poder no golpe (core/custoPoder.js): [{ energia, bruto }].
    let custosPoder = [];
    const registrarCustoPoder = (energia, perc, aplicarReducao) => {
        const bruto = custoBrutoDeEnergia(minhaFicha, energia, perc, aplicarReducao);
        if (bruto > 0) custosPoder.push({ energia, bruto });
    };
    let comoPoderNames = [];

    if (armaEquipada && configArma && configArma.percEnergia > 0) {
        let { dreno } = calcularDreno(configArma.energiaCombustao, configArma.percEnergia);
        registrarCustoPoder(configArma.energiaCombustao, configArma.percEnergia, true);
        if (dreno > 0) {
            if (!drenosPorEnergia[configArma.energiaCombustao]) drenosPorEnergia[configArma.energiaCombustao] = 0;
            drenosPorEnergia[configArma.energiaCombustao] += dreno;
        }
    }

    for (let i = 0; i < configHabilidades.length; i++) {
        let hab = configHabilidades[i];
        let isElemental = (hab.vertente || '').toLowerCase().includes('elemental');
        let margem = getMargemCusto(hab);
        let comoPoder = !!hab.comoPoder && podeConjurarComoPoder(minhaFicha, hab) && margem.max > 0;

        if (comoPoder) {
            // 0% de energia gasta, benefício do Custo escolhido na margem, com Mana, Aura e Chakra juntas.
            let perc = limitarPercComoPoder(hab, hab.percComoPoder);
            ENERGIAS_COMO_PODER.forEach(e => registrarCustoPoder(e, perc, false));
            comoPoderNames.push(`${hab.nome} ${perc}%`);
        } else if (hab.custoPercentual > 0) {
            if (isElemental) {
                // Ressonância Natural (Elemental inato): sem custo, e as três energias entram no Poder do golpe.
                ENERGIAS_COMO_PODER.forEach(e => registrarCustoPoder(e, hab.custoPercentual, false));
                innateNames.push(hab.nome);
            } else {
                let { dreno } = calcularDreno(hab.energiaCombustao, hab.custoPercentual);
                registrarCustoPoder(hab.energiaCombustao, hab.custoPercentual, true);
                if (dreno > 0) {
                    if (!drenosPorEnergia[hab.energiaCombustao]) drenosPorEnergia[hab.energiaCombustao] = 0;
                    drenosPorEnergia[hab.energiaCombustao] += dreno;
                }
            }
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
    if (comoPoderNames.length > 0) {
        custoTxt.push(`<span style="color:#0f0; text-shadow: 0 0 5px #0f0;">ZERO (${comoPoderNames.join(', ')} como Poder)</span>`);
    }

    // 🎲 Fontes de dano: a arma equipada com dados, as habilidades vinculadas a ela e as livres/técnicas com dados.
    const fontes = [];
    if (armaEquipada && (armaEquipada.dadosQtd || 0) > 0) {
        fontes.push(rolarFonteDeDano({ nome: armaEquipada.nome, tipo: 'arma', qtdDados: armaEquipada.dadosQtd, facesDados: armaEquipada.dadosFaces || 20, sels: configArma ? configArma.statusUsados : null }));
    }
    for (let i = 0; i < configHabilidades.length; i++) {
        const hab = configHabilidades[i];
        if ((hab.dadosQtd || 0) <= 0) continue;
        const vinculada = !!armaEquipada && !!hab.armaVinculada && String(hab.armaVinculada) === String(armaEquipada.id);
        fontes.push(rolarFonteDeDano({ nome: hab.nome, tipo: vinculada ? 'vinculada' : 'habilidade', qtdDados: hab.dadosQtd, facesDados: hab.dadosFaces || 20, sels: hab.statusUsados }));
    }

    const somaDados = fontes.reduce((s, f) => s + f.soma, 0);
    const status = somarStatusDasFontes(fontes, minhaFicha);
    let somaDanos = fontes.length > 0 ? somaDados + status.soma : 0;
    somaDanos += iDanoBruto;

    if (fontes.length === 0 && somaDanos === 0) {
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

    let multEfetivo = multCritico;
    
    let total = Math.floor(somaDanos * multEfetivo);
    if (isNaN(total)) total = 0;

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
    if (multCritico > 1) multArr.push(`<span style="color:#ffcc00">x${multCritico}(${nomeCritico})</span>`); 
    let multStr = multArr.length > 0 ? multArr.join(' * ') : 'Nenhum (x1, os multiplicadores agora valem no Poder Calculado)';

    let detalheLinhas = [`<span style="color:#ffcc00; font-weight:bold;">[MÁQUINA DE CÁLCULO]</span>`];

    fontes.forEach(f => {
        const cor = f.tipo === 'arma' ? '#0f0' : '#f0f';
        const rotulo = f.tipo === 'arma' ? 'Dados da Arma' : (f.tipo === 'vinculada' ? 'Dados da Habilidade (vinculada à arma)' : 'Dados da Habilidade');
        detalheLinhas.push(`<strong style="color:${cor}">${rotulo} [${f.nome}]:</strong> <span style="color:${cor}">${f.rolagem}</span>`);
    });
    if (fontes.length > 0) {
        detalheLinhas.push(`<strong>Soma dos Dados:</strong> ${somaDados.toLocaleString('pt-BR')}`);
        detalheLinhas.push(`<strong>Status:</strong> ${status.detalhes.join(' + ')} = <strong style="color:#ff003c">${status.soma.toLocaleString('pt-BR')}</strong>`);
        detalheLinhas.push(`<strong>Dano Base:</strong> ${somaDados.toLocaleString('pt-BR')} (dados) + ${status.soma.toLocaleString('pt-BR')} (status) = ${(somaDados + status.soma).toLocaleString('pt-BR')}`);
    }

    detalheLinhas.push(`<strong>Soma:</strong> ${somaDanos.toLocaleString('pt-BR')}${iDanoBruto > 0 ? ` (inclui +${iDanoBruto.toLocaleString('pt-BR')} bruto)` : ''}`);
    detalheLinhas.push(`<strong>Multiplicadores:</strong> ${multStr} = <strong style="color:#fff;">x${multEfetivo % 1 === 0 ? multEfetivo : multEfetivo.toFixed(2)}</strong>`);
    detalheLinhas.push(`<strong>Dano Total:</strong> ${somaDanos.toLocaleString('pt-BR')} x ${multEfetivo % 1 === 0 ? multEfetivo : multEfetivo.toFixed(2)} = <strong style="color:#ff003c; font-size:1.1em;">${total.toLocaleString('pt-BR')}</strong>`);

    const custoPoderBruto = somarCustosBrutos(custosPoder);
    if (custoPoderBruto > 0) {
        detalheLinhas.push(`<strong style="color:#0ff">Custo no Poder:</strong> o Custo não entra no dano; ele aumenta o Poder deste golpe na Disputa de Poder.`);
    }

    let detalheConta = `<div style="margin-top: 15px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 5px; border-left: 3px solid #ffcc00; font-family: monospace; font-size: 0.95em; color: #ccc;">
    ${detalheLinhas.join('<br>')}
    </div>`;

    const rolagemTextoFinal = fontes.map(f => `${f.tipo === 'arma' ? 'Arma' : f.nome}: ${f.rolagem}`).join(' | ');

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
        detalheConta, drenos, energiaDrenada: true,
        custoPoderBruto, custosPoder
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

    // 🛡️ Vantagem de CLASSE (Saber/Lancer/Archer com a arma do tipo, Rider montado): soma às que o jogador marcou.
    const vantagemClasse = getVantagensDeClasse(minhaFicha, tiposArmas);
    let { sD, rolagemTexto } = rolarDadosComVantagem(qD, fD, (parseInt(vantagens) || 0) + vantagemClasse.vantagens, desvantagens);

    let vSt = 0;
    for (let i = 0; i < sels.length; i++) {
        // O Acerto soma só a DEZENA do atributo (120 -> +12), sem a Ascensão oculta: o bônus não estoura.
        vSt += modificadorDezena(getRawBase(minhaFicha, sels[i]));
    }

    let bp = getPoderesDefesa(minhaFicha, 'bonus_acerto');
    const bonusClasse = getBonusAcertoDeClasse(minhaFicha);
    
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
                const nomeProf = ef.atributo.trim().toUpperCase();
                if (!nomesProfArma.includes(nomeProf)) nomesProfArma.push(nomeProf);
            }
        }
    }

    let atrNames = [];
    // Ficha antiga pode não ter o atributo: cai no nome da chave em vez de quebrar a rolagem.
    for (let i = 0; i < sels.length; i++) atrNames.push(minhaFicha[sels[i]]?.nome || sels[i].toUpperCase());

    let armaStr = nomesArmas.length ? ` equipado com <strong>${nomesArmas.join(' e ')}</strong>` : '';

    let profBonusTexto = 'Prof: +' + prof + ' | Bônus Fixo: +' + bonus + 
                         (bp > 0 ? ' | Forma: +' + bp : '') + 
                         (iAcerto > 0 ? ' | Arma: +' + iAcerto : '') +
                         (bonusProfArma > 0 ? ` | Maestria (${nomesProfArma.join(', ')}): +${bonusProfArma}` : '') +
                         (bonusClasse > 0 ? ` | Classe (Rider): +${bonusClasse}` : '') +
                         (vantagemClasse.vantagens > 0 ? ` | ${vantagemClasse.motivos.join(' + ')}` : '');

    return {
        acertoTotal: Math.floor(vSt + prof + bonus + bp + sD + iAcerto + bonusProfArma + bonusClasse), 
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

    // 🔥 APLICA O PODER DE LUTA VERDADEIRO NA EVASIVA 🔥
    let baseVal = getPoderDeLutaStatus(minhaFicha, 'destreza', true);
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

    // 🔥 APLICA O PODER DE LUTA VERDADEIRO NA RESISTÊNCIA 🔥
    let baseVal = getPoderDeLutaStatus(minhaFicha, 'forca', true);
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
        // 🔥 CORREÇÃO: mesma causa-raiz de calcularDreno acima (ver core/vitals.js >
        // getVitalMxDisplay) — "atual" é sempre guardado na escala exibida/comprimida, nunca no
        // bruto de getMaximo, então o gasto calculado sobre o bruto ficava desproporcional ao
        // comparar/subtrair contra "atual".
        let mMax = getVitalMxDisplay(e, minhaFicha);
        let gt = Math.floor(mMax * (perc / 100));
        let redBase = (minhaFicha[e] && minhaFicha[e].reducaoCusto) ? parseFloat(minhaFicha[e].reducaoCusto) : 0;
        let red = Math.min(100, redBase + bEnergia.reducaoCusto);
        let cr = Math.floor(gt * (1 - (red / 100)));
        if ((minhaFicha[e]?.atual || 0) < cr) return { erro: 'Sem energia!' };
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
    let nDef = energiaKey === 'poder' ? 'PODER TOTAL' : (minhaFicha[energiaKey]?.nome || String(energiaKey).toUpperCase());

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

export function processarDefesaComCondicoes(ficha, tipoDefesa, caBaseCalculado) {
    if (!ficha || !ficha.condicoes) return caBaseCalculado;
    let caFinal = caBaseCalculado;
    const tem = (id) => ficha.condicoes.some(c => c.id === id);
    const stacks = (id) => { const c = ficha.condicoes.find(x => x.id === id); return c ? c.stacks : 0; };

    if (tipoDefesa === 'evasiva') {
        if (tem('imobilizado') || tem('incapacitado') || tem('petrificado') || stacks('exausto') >= 5) return 0;
        if (tem('lento') || stacks('exausto') >= 2 || stacks('criogenia') >= 3) caFinal = Math.floor(caFinal / 2);
    }
    if (tipoDefesa === 'resistencia') {
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
    
    let multFinal = 1.0; 

    if (ficha.condicoes) {
        ficha.condicoes.forEach(c => {
            if (c.id === 'sangrando' || c.id === 'queimado' || c.id === 'criogenia') {
                for(let i = 0; i < c.stacks; i++) {
                    multFinal *= 0.5; 
                }
            }
            if (c.id === 'exausto' && c.stacks >= 4) {
                multFinal *= 0.5;
            }
        });
    }

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