import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { ELEMENTOS_SISTEMA } from '../../core/elementos';
import useStore from '../../stores/useStore';
import { calcularReducao, calcularCA } from '../../core/engine';
import { aplicarReacoesAoDano, reacoesPendentesValidas } from '../../core/reacoes';
import { getPassosReducaoDano, aplicarReducoesSequenciais, descreverReducoes } from '../../core/reducaoDano';
import { enviarParaFeed } from '../../services/firebase-sync';
import { gastarAcoes } from '../../core/acoesTecnica';
import { montarAlvoPersonagem, reduzirDanoNoAlvo } from '../../core/alvoCombate';
import { gravarVidaDoAlvo } from '../../services/danoAlvo';
import { reflexosDisponiveis, calcularReflexo, descreverReflexo, custoDoReflexo } from '../../core/reflexo';
import { resolverEstadosNoAlvo, descreverResolucao, juntarAplicados } from '../../core/estadosGolpe';
import { aplicarEstadoNaFicha } from '../../core/condicoes';
import { useFichaAtiva, useCallSaveAtivo } from '../Ficha Def/FichaAlvoContext';
import { danoExibidoParaBruto } from '../../core/vitals';
import { aplicarDanoNaVidaDaFicha, textoDosGatilhos, novoEventoId, perguntarGatilhosDeDano } from '../../services/danoVida';
import { aplicarExternosDeGatilhos } from '../../services/gatilhosEventos';
import { temImunidadeTotal } from '../../core/gatilhosAplicar';
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
    // Ficha em foco: a minha, ou a da entidade que o Mestre está vendo na Ficha Definitiva.
    const { ficha: minhaFicha, updateFicha, nome: meuNome, souEuMesmo } = useFichaAtiva();
    const salvarFichaSilencioso = useCallSaveAtivo();
    const personagens = useStore(s => s.personagens); // 🔥 VARREDURA GLOBAL DE PERSONAGENS DA MESA
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
    // O dano que chega de um Ataque (dados + Status) já está na escala da Vida; só a fórmula livre de dados puros pede a proporção.
    const [danoDeDado, setDanoDeDado] = useState(false);
    // 💀 Dano Verdadeiro (simulado pelo Mestre): ignora Reduções, Resistências, Imunidades e Domínio.
    const [danoVerdadeiro, setDanoVerdadeiro] = useState(false);
    // ↩️ Reflexo (core/reflexo.js) que vou usar neste Dano: '' (nenhum) ou 'poder:<id>' / 'tecnica:<id>'.
    const [reflexoEscolhido, setReflexoEscolhido] = useState('');
    const reflexosUsaveis = useMemo(() => reflexosDisponiveis(minhaFicha), [minhaFicha]);

    const ultimoGolpeRecebido = useMemo(() => {
        const feed = feedCombate || [];
        for (let i = feed.length - 1; i >= 0; i--) {
            const f = feed[i];
            // Golpe com alvoNome foi numa entidade do Mapa (dummy), não em um jogador: não conta.
            // Golpe em área que já gravou o dano direto na minha ficha (alvosAplicados) também não conta.
            if (f && f.tipo === 'dano' && f.nome && f.nome !== meuNome && !f.alvoNome && !(Array.isArray(f.alvosAplicados) && f.alvosAplicados.includes(meuNome))) return f;
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
        const baseArray = ELEMENTOS_SISTEMA;
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

        // O Bônus Extra entra DENTRO da redução da CA (como todo bônus), não somado solto no fim.
        const caComBonus = calcularCA(minhaFicha, 'evasiva', bonus);
        const total = caComBonus + diceTotal + prof;
        const baseCalc = `${diceStr}CA Evasiva (${caComBonus}, j\u00e1 com B\u00f3nus Extra ${bonus}) + Prof (${prof})`;

        const feedData = { tipo: 'evasiva', nome: meuNome, total, baseCalc };
        enviarParaFeed(feedData);
        setAbaAtiva('aba-log');
    }, [evaDados, evaFaces, evaProf, evaBonus, minhaFicha, meuNome, setAbaAtiva, rolar]);

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

        const caComBonus = calcularCA(minhaFicha, 'resistencia', bonus);
        const total = caComBonus + diceTotal + prof;
        const baseCalc = `${diceStr}CA Resist\u00eancia (${caComBonus}, j\u00e1 com B\u00f3nus Extra ${bonus}) + Prof (${prof})`;

        const feedData = { tipo: 'resistencia', nome: meuNome, total, baseCalc };
        enviarParaFeed(feedData);
        setAbaAtiva('aba-log');
    }, [resDados, resFaces, resProf, resBonus, minhaFicha, meuNome, setAbaAtiva, rolar]);

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
    }, [redEnergia, redPerc, redMult, minhaFicha, meuNome, updateFicha, salvarFichaSilencioso, setAbaAtiva]);

    const sofrerDanoBruto = useCallback(() => {
        const danoDigitado = parseInt(danoRecebidoInc) || 0;
        if (danoDigitado <= 0) return alert('Digite um valor de dano válido para receber.');
        // 🛡️ God Mode (Imunidade total): ignora TUDO. Nenhuma reação pendente é usada/consumida/mostrada, nenhum confirm abre, e o feed só avisa.
        const imune = temImunidadeTotal(minhaFicha);
        // ↩️ Reações já usadas contra este ataque (core/reacoes.js): "atacar o ataque" e redução de Dano entram aqui.
        // Só valem reações recentes (core/reacoes.js > reacoesPendentesValidas): uma esquecida não pesa em Danos futuros.
        const reacoesPendentes = imune ? [] : reacoesPendentesValidas(minhaFicha);
        const completas = aplicarReacoesAoDano(danoDigitado, reacoesPendentes);
        if (completas.faltaDanoReacao && !window.confirm('Você escolheu "Atacar o ataque", mas ainda não rolou o seu Dano de reação (aba Ataque ou Livro de Combate). Receber o Dano inteiro mesmo assim?')) return;
        // Sem o Dano da reação rolado, só entram as reduções em % (a "atacar o ataque" fica de fora).
        const aplicadas = completas.faltaDanoReacao ? aplicarReacoesAoDano(danoDigitado, reacoesPendentes.filter(r => r.efeito !== 'atacar_ataque')) : completas;
        const dano = aplicadas.final;

        const { disputa, nomeAtacante } = disputaDefesa;
        const danoBase = danoDeDado
            ? escalarDanoPelaVida(dano, getVidaMaxExibidaFicha(minhaFicha), getPontosVidaTotal(useStore.getState().cenario))
            : dano;
        const danoDisputa = aplicarDisputaAoDano(danoBase, disputa);
        // 🛡️ Reduções/Resistências aplicadas em SEQUÊNCIA, uma de cada vez (core/reducaoDano.js).
        const reduzido = aplicarReducoesSequenciais(danoDisputa, danoVerdadeiro ? [] : getPassosReducaoDano(minhaFicha, elementoInc, elementosDinamicos.find(e => e.id === elementoInc)?.nome));
        let danoFinal = reduzido.final;

        // ↩️ Reflexo escolhido: devolve (ou divide) o Dano com quem me atacou. Precisa saber quem foi e ter como pagar.
        let textoReflexo = '';
        let aplicarNoAtacante = null;
        let textosGatilhosAtacante = [];
        let custoPago = 0;
        // (God Mode também dispensa o Reflexo e a cobrança dele, e os estados do golpe.)
        const usado = reflexoEscolhido && !imune ? reflexosUsaveis.find(r => `${r.origem}:${r.id}` === reflexoEscolhido) : null;
        if (usado) {
            const escolhaAtacante = atacanteInc === ATACANTE_AUTO ? (ultimoGolpeRecebido ? `p:${ultimoGolpeRecebido.nome}` : ATACANTE_NENHUM) : atacanteInc;
            const golpeDoReflexo = ultimoGolpeRecebido && escolhaAtacante === `p:${ultimoGolpeRecebido.nome}` ? ultimoGolpeRecebido : null;
            const { energia: k, valor: custo } = custoDoReflexo(minhaFicha, usado, golpeDoReflexo ? golpeDoReflexo.custoGolpeTotal : 0);
            if (escolhaAtacante === ATACANTE_NENHUM || (!escolhaAtacante.startsWith('p:') && !escolhaAtacante.startsWith('d:'))) {
                if (!window.confirm('Não sei quem te atacou, então o Reflexo não tem para quem voltar. Receber o Dano inteiro mesmo assim?')) return;
            } else if (custo > 0 && (Number(minhaFicha[k] && minhaFicha[k].atual) || 0) < custo) {
                if (!window.confirm(`Sem ${k.toUpperCase()} para pagar o Reflexo (${custo.toLocaleString('pt-BR')}). Receber o Dano inteiro mesmo assim?`)) return;
            } else {
                const calculo = calcularReflexo(usado.reflexo, { danoChega: danoFinal, danoOriginal: danoDigitado });
                danoFinal = calculo.danoNoDefensor;
                const idAtacante = escolhaAtacante.startsWith('d:') ? escolhaAtacante.slice(2) : `pj:${escolhaAtacante.slice(2)}`;
                const alvoAtacante = escolhaAtacante.startsWith('d:')
                    ? (dummies || {})[idAtacante]
                    : montarAlvoPersonagem(escolhaAtacante.slice(2), (personagens || {})[escolhaAtacante.slice(2)], divisorPoderMesa);
                textoReflexo = descreverReflexo(usado, calculo, nomeAtacante || 'o atacante');
                aplicarNoAtacante = () => {
                    if (!alvoAtacante || calculo.danoNoAtacante <= 0) return;
                    const final = reduzirDanoNoAlvo(alvoAtacante, calculo.danoNoAtacante, elementoInc, { verdadeiro: danoVerdadeiro }).final;
                    const gv = gravarVidaDoAlvo(idAtacante, alvoAtacante, Math.max(0, (Number(alvoAtacante.hpAtual) || 0) - danoExibidoParaBruto(final)), { elemento: elementoInc });
                    textosGatilhosAtacante = (gv && gv.textos) || [];
                };
                custoPago = custo;
            }
        }

        // 🩸 Estados do golpe (feed.estadosGolpe) que ainda não entraram em mim: só se este Dano é o deste golpe e ele não foi devolvido por completo.
        const golpeDoDano = ultimoGolpeRecebido && ultimoGolpeRecebido.nome === nomeAtacante ? ultimoGolpeRecebido : null;
        const jaRecebi = golpeDoDano && minhaFicha.combate && minhaFicha.combate.estadosDoGolpeTs === golpeDoDano.ts;
        const resolucao = !imune && golpeDoDano && Array.isArray(golpeDoDano.estadosGolpe) && golpeDoDano.estadosGolpe.length > 0 && !jaRecebi && !(usado && danoFinal === 0 && textoReflexo)
            ? resolverEstadosNoAlvo(golpeDoDano.estadosGolpe, minhaFicha, { critico: !!golpeDoDano.golpeCritico })
            : null;

        // Nível do golpe para o evento `atingido`: golpeNivel (feed novo), senão golpeCritico (feed antigo), senão normal.
        const nivelDoGolpe = golpeDoDano && ['normal', 'critico', 'fatal'].includes(golpeDoDano.golpeNivel) ? golpeDoDano.golpeNivel : (golpeDoDano && golpeDoDano.golpeCritico ? 'critico' : 'normal');
        let textoEscudo = '';
        let textoGatilhos = '';
        let externosDano = [];
        // 🔔 Quem me atacou (só personagem com ficha): habilita a ação "dano no atacante" dos gatilhos. Dummie ou desconhecido = sem atacante.
        const escolhaDoGolpe = atacanteInc === ATACANTE_AUTO ? (ultimoGolpeRecebido ? `p:${ultimoGolpeRecebido.nome}` : ATACANTE_NENHUM) : atacanteInc;
        const nomeAtacanteFicha = escolhaDoGolpe.startsWith('p:') && (personagens || {})[escolhaDoGolpe.slice(2)] ? escolhaDoGolpe.slice(2) : '';
        // Cada clique em "Receber dano" é uma aplicação distinta: id único, gerado FORA do produtor Immer (o ts do feed é do último golpe, igual entre cliques).
        const eventoIdClique = novoEventoId();
        const ctxDano = { nome: meuNome, nomeEscudo: meuNome, eventoId: eventoIdClique, golpe: { nivel: nivelDoGolpe }, ...(nomeAtacanteFicha ? { atacante: { nome: nomeAtacanteFicha } } : {}) };
        // 🔔 Modo opcional com "perguntar": o dano é aplicado AQUI, no cliente do dono; pergunta antes de gravar (Não = não dispara e não gasta o limite).
        // Só pergunta no cliente do PRÓPRIO dono: o Mestre aplicando dano na ficha de outro jogador (souEuMesmo falso) não decide por ele; vale só `armado`.
        // A pergunta cobre apenas dano na Vida; a previsão usa rng 0, então gatilhos disparados por OUTRAS linhas de uma tabela de dado valem pelo `armado`.
        const decisoesGatilhos = imune || souEuMesmo === false ? {} : perguntarGatilhosDeDano(minhaFicha, danoFinal, ctxDano);
        updateFicha((ficha) => {
            if (resolucao) {
                juntarAplicados(resolucao.aplicados).forEach(a => aplicarEstadoNaFicha(ficha, a.id, a.stacks, nomeAtacante || ''));
                if (!ficha.combate) ficha.combate = {};
                ficha.combate.estadosDoGolpeTs = golpeDoDano.ts;
            }
            if (usado && textoReflexo) {
                if (custoPago > 0 && ficha[usado.reflexo.energia]) ficha[usado.reflexo.energia].atual = Math.max(0, (ficha[usado.reflexo.energia].atual || 0) - custoPago);
                if (usado.reflexo.gastaReacao) gastarAcoes(ficha, ['reacao']);
            }
            if (!imune && ficha.combate && Array.isArray(ficha.combate.reacoesPendentes) && ficha.combate.reacoesPendentes.length > 0) ficha.combate.reacoesPendentes = [];
            if (ficha.vida) {
                // O dano digitado é o número EXIBIDO (feed/tela); vida.atual é bruta.
                // 🛡️ Escudos e Vida temporária absorvem antes (core/escudos.js); o que sobra vai para a Vida.
                // 🔔 Ponto único de dano na Vida (core/danoVida.js): Imunidade total, escudo, gatilhos de morte e de faixas de Vida.
                const r = aplicarDanoNaVidaDaFicha(ficha, danoFinal, { ...ctxDano, decisoes: decisoesGatilhos });
                textoEscudo = r.textoEscudo;
                externosDano = r.externos || [];
                textoGatilhos = textoDosGatilhos(r);
            }
        });
        salvarFichaSilencioso();

        const mensagemElemental = (danoVerdadeiro ? ' [💀 Dano Verdadeiro: ignora reduções, resistências e imunidades]' : '') + (reduzido.detalhe.length > 0 ? ` [${descreverReducoes(reduzido)}]` : '') + (aplicadas.detalhes.length > 0 ? ` ↩️ [${aplicadas.detalhes.join(' · ')}]` : '');

        const nomeElemento = elementosDinamicos.find(e => e.id === elementoInc)?.nome || elementoInc;

        const deQuem = nomeAtacante ? ` de ${nomeAtacante}` : '';
        const textoEstados = resolucao ? descreverResolucao(resolucao, meuNome) : '';
        const texto = `Recebeu ${danoFinal} de dano${deQuem}! (Original: ${danoDigitado} de ${nomeElemento.toUpperCase()})${mensagemElemental}${textoReflexo ? ` ${textoReflexo}` : ''}${textoEstados ? ` 🩸 ${textoEstados}` : ''}${textoEscudo ? ` 🛡️ ${textoEscudo}` : ''}${textoGatilhos ? ` ${textoGatilhos}` : ''}`;
        if (aplicarNoAtacante) aplicarNoAtacante();
        if (imune) {
            // Só o aviso (o texto de Imunidade total vem do ponto único de dano na Vida).
            enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto: `${meuNome} está com Imunidade total: o golpe não surtiu efeito` });
            setDanoRecebidoInc(''); setElementoInc('fisico'); setAtacanteInc(ATACANTE_AUTO); setDanoDeDado(false); setDanoVerdadeiro(false);
            return;
        }
        // Ordem: primeiro o Reflexo (aplicarNoAtacante, acima), depois os efeitos de gatilhos no atacante: o Reflexo é a reação já escolhida ao golpe e o gatilho é consequência de a Vida ter sido tocada.
        // 🔔 Efeitos de gatilhos na ficha do atacante (ex.: a Volta das cinzas devolve o dano). Cada falha fica isolada: nunca trava o fluxo de dano.
        if (externosDano.length > 0) { try { aplicarExternosDeGatilhos(externosDano).forEach(t => enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🔔 ${t}` })); } catch (e) { console.error('Gatilho externo falhou', e); } }
        if (textosGatilhosAtacante.length > 0) enviarParaFeed({ tipo: 'sistema', nome: 'SISTEMA', texto: `🔔 ${nomeAtacante || 'O atacante'}: ${textosGatilhosAtacante.join(' · ')}` });

        // Quem leva vantagem na Disputa de Poder é informação do Mestre (textoMestre).
        const feedData = { tipo: 'sistema', nome: meuNome, texto: texto, ...(disputa && disputa.ativa ? { textoMestre: descreverDisputa(disputa) } : {}) };
        enviarParaFeed(feedData);
        
        setDanoRecebidoInc('');
        setElementoInc('fisico');
        setAtacanteInc(ATACANTE_AUTO);
        // Volta ao padrão (dano já na escala da Vida): a caixa marcada vale só pra este golpe.
        setDanoDeDado(false);
        setDanoVerdadeiro(false);
        setReflexoEscolhido('');
        setAbaAtiva('aba-log');
    }, [danoRecebidoInc, elementoInc, minhaFicha, meuNome, souEuMesmo, updateFicha, salvarFichaSilencioso, setAbaAtiva, elementosDinamicos, disputaDefesa, danoDeDado, danoVerdadeiro, reflexoEscolhido, reflexosUsaveis, atacanteInc, ultimoGolpeRecebido, dummies, personagens, divisorPoderMesa]);

    const value = useMemo(() => ({
        evaDados, setEvaDados, evaFaces, setEvaFaces, evaProf, setEvaProf, evaBonus, setEvaBonus,
        resDados, setResDados, resFaces, setResFaces, resProf, setResProf, resBonus, setResBonus,
        redEnergia, setRedEnergia, redPerc, setRedPerc, redMult, setRedMult,
        elementoInc, setElementoInc, danoRecebidoInc, setDanoRecebidoInc,
        atacanteInc, setAtacanteInc, opcoesAtacante, ultimoGolpeRecebido, disputaDefesa, danoDeDado, setDanoDeDado, danoVerdadeiro, setDanoVerdadeiro,
        reflexoEscolhido, setReflexoEscolhido, reflexosUsaveis,
        caEvasiva, caResistencia,
        elementosDinamicos, 
        declararEvasiva, declararResistencia, declararReducao, sofrerDanoBruto
    }), [
        evaDados, evaFaces, evaProf, evaBonus, resDados, resFaces, resProf, resBonus,
        redEnergia, redPerc, redMult, elementoInc, danoRecebidoInc, caEvasiva, caResistencia,
        atacanteInc, opcoesAtacante, ultimoGolpeRecebido, disputaDefesa, danoDeDado, danoVerdadeiro, reflexoEscolhido, reflexosUsaveis,
        elementosDinamicos, declararEvasiva, declararResistencia, declararReducao, sofrerDanoBruto
    ]);

    return (
        <DefesaFormContext.Provider value={value}>
            {children}
        </DefesaFormContext.Provider>
    );
}