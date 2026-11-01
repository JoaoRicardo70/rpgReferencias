// ==========================================
// ✨ USAR SUPORTE — cura e buffs (core/suporte.js) em quem usa e/ou em aliados. O plano é puro (planejarUsoSuporte); usarSuporte
// grava: em MIM pela ficha local (updateFicha), nos aliados só os campos que mudam (salvarCamposPersonagem), nunca a ficha inteira.
// ==========================================
import { salvarCamposPersonagem, enviarParaFeed } from './firebase-sync';
import { normalizarSuporte, destinatariosPermitidos, calcularCuraSuporte, somarBuffTemporario } from '../core/suporte';
import { calcularEficaciaCura } from '../core/engine';
import { getVidaMaxBrutaNpc } from '../core/gavetaNpc';
import { getVidaMaxExibidaFicha } from '../core/danoProporcional';
import { danoExibidoParaBruto, getVitalMxDisplay } from '../core/vitals';
import { descreverBuff } from '../core/combos';
import { gastarAcoes, acoesEmFalta } from '../core/acoesTecnica';

// Quem recebe o quê. `fichas` = { nome: ficha } de todos (inclui a minha). Devolve { erro } ou { receptores, custo }.
export function planejarUsoSuporte({ item, meuNome, fichas, aliados = [], agora = Date.now(), rolar }) {
    const s = normalizarSuporte(item && item.suporte);
    if (!s) return { erro: 'Este item não tem Cura nem Buffs configurados.' };
    if (s.modo === 'passivo') return { erro: 'Este suporte é passivo: ele já está ligado enquanto o Poder/Item estiver em uso.' };
    const dest = destinatariosPermitidos(s, aliados);
    const nomes = [...(dest.eu ? [meuNome] : []), ...dest.aliados.filter(n => n !== meuNome)];
    if (nomes.length === 0) return { erro: s.alvos === 'si' ? 'Sem destinatário.' : 'Escolha pelo menos um aliado.' };
    const receptores = [];
    nomes.forEach((nome, i) => {
        const ficha = fichas[nome];
        if (!ficha) return;
        const r = { nome, vidaNova: null, cura: null, buffsNovos: null };
        if (s.cura) {
            const cura = calcularCuraSuporte(s, { vidaMaxExibida: getVidaMaxExibidaFicha(ficha) || 0, eficacia: calcularEficaciaCura(ficha), rolar });
            const maxBruto = getVidaMaxBrutaNpc(ficha);
            const atual = Number(ficha.vida && ficha.vida.atual);
            if (Number.isFinite(atual) && maxBruto > 0) {
                // Curar nunca baixa a Vida (ela pode estar acima do teto, por Forma ou buff que acabou).
                r.vidaNova = Math.max(atual, Math.min(maxBruto, atual + danoExibidoParaBruto(cura.total)));
                r.cura = cura;
            }
        }
        if (s.buffs.length > 0) {
            r.buffsNovos = somarBuffTemporario(ficha.buffsTemporarios, { id: `${item.id}_${agora}_${i}`, nome: item.nome, fonte: meuNome, efeitos: s.buffs, duracao: s.duracao, duracaoModo: s.duracaoModo });
        }
        receptores.push(r);
    });
    const eu = fichas[meuNome];
    const custo = s.custoPercentual > 0 && eu ? { energia: s.energia, valor: Math.floor(getVitalMxDisplay(s.energia, eu) * (s.custoPercentual / 100)) } : { energia: s.energia, valor: 0 };
    return { suporte: s, receptores, custo };
}

export function descreverUsoSuporte(plano, nomeItem, meuNome) {
    const partes = plano.receptores.map((r) => {
        const o = [];
        if (r.cura) o.push(`curou ${r.cura.total.toLocaleString('pt-BR')}`);
        if (r.buffsNovos && plano.suporte.buffs.length > 0) o.push(`buffs (${plano.suporte.buffs.map(descreverBuff).join('; ')})${plano.suporte.duracao > 0 ? ` por ${plano.suporte.duracao} turno(s)` : (plano.suporte.duracaoModo === 'combate' ? ' até o fim do combate' : '')}`);
        return `${r.nome}: ${o.join(' + ') || 'nada'}`;
    });
    return `✨ ${meuNome} usou ${nomeItem}! ${partes.join(' · ')}`;
}

// Executa: paga custo/Ação, grava em cada receptor e avisa no Feed. `ctx` = { meuNome, minhaFicha, personagens, updateFicha, salvarFichaSilencioso, avisar }.
export function usarSuporte({ item, aliados, ctx }) {
    const { meuNome, minhaFicha, personagens, updateFicha, salvarFichaSilencioso } = ctx;
    const plano = planejarUsoSuporte({ item, meuNome, fichas: { ...(personagens || {}), [meuNome]: minhaFicha }, aliados });
    if (plano.erro) return { erro: plano.erro };
    const { suporte: s, custo } = plano;
    if (custo.valor > 0 && (Number(minhaFicha[custo.energia] && minhaFicha[custo.energia].atual) || 0) < custo.valor) {
        return { erro: `Sem ${custo.energia.toUpperCase()} para pagar (${custo.valor.toLocaleString('pt-BR')}).` };
    }
    if (s.acao !== 'nenhuma') {
        const falta = acoesEmFalta(minhaFicha, [s.acao]);
        if (falta.length > 0 && !window.confirm(`Sem ${falta.join(' e ')} disponível. Usar mesmo assim?`)) return { cancelado: true };
    }
    plano.receptores.forEach((r) => {
        if (r.nome === meuNome) return;
        const campos = {};
        if (r.vidaNova !== null) campos['vida/atual'] = r.vidaNova;
        if (r.buffsNovos) campos.buffsTemporarios = r.buffsNovos;
        if (Object.keys(campos).length > 0) salvarCamposPersonagem(r.nome, campos);
    });
    const meu = plano.receptores.find(r => r.nome === meuNome);
    updateFicha((f) => {
        if (custo.valor > 0 && f[custo.energia]) f[custo.energia].atual = Math.max(0, (f[custo.energia].atual || 0) - custo.valor);
        if (s.acao !== 'nenhuma') gastarAcoes(f, [s.acao]);
        if (meu) {
            if (meu.vidaNova !== null && f.vida) f.vida.atual = meu.vidaNova;
            if (meu.buffsNovos) f.buffsTemporarios = meu.buffsNovos;
        }
    });
    salvarFichaSilencioso();
    const texto = descreverUsoSuporte(plano, item.nome, meuNome);
    enviarParaFeed({ tipo: 'sistema', nome: meuNome, texto });
    return { texto };
}
