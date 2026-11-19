// Aplica na ficha (rascunho Immer) o que o jogador escolheu: iniciar um Combo, avançar um golpe ou usar um Follow Up.
// Fica fora de core/ porque junta o estado do Combo (core/combos.js) com o gasto de Ações (core/acoesTecnica.js).
import { estadoDeCombo, iniciarCombo, avancarCombo, usarFollowUp, nivelDoFollowUp, rotuloAcaoGolpe, resumirCombo } from '../../core/combos';
import { gastarAcoes, acoesEmFalta } from '../../core/acoesTecnica';
import { localizarFollowUp, ofertasValidas, removerOfertaFollowUp, definirReducaoCusto, marcarSemEncadeio } from '../../core/ofertaFollowUp';

// Grava o estado do Combo na ficha (rascunho Immer).
export function definirEstadoDeCombo(ficha, estado) {
    if (!ficha.combate) ficha.combate = {};
    ficha.combate.comboEstado = estado;
}

// escolha: { tipo: 'iniciar' | 'avancar' | 'followUp', combo?, golpe, followUp?, custo? } (custo = Ação a gastar: 'padrao' | 'bonus' | 'reacao')
// Devolve o texto do feed (e muta a ficha). `gastar` = false só registra o progresso (a Ação já foi paga por outro caminho).
export function aplicarEscolhaCombo(ficha, escolha, { gastar = true } = {}) {
    if (!ficha || !escolha) return '';
    const estado = estadoDeCombo(ficha);
    const tipoCusto = escolha.custo || (escolha.golpe && escolha.golpe.acao) || 'padrao';
    let novo = estado;
    let texto = '';

    if (escolha.tipo === 'iniciar') {
        novo = iniciarCombo(estado, escolha.combo);
        if (novo === estado) return ''; // já havia um Combo em andamento: nada a registrar nem a cobrar
        const concluiu = !novo.ativo;
        texto = `🥋 ${escolha.golpe.nome || 'Golpe'} acertou e iniciou o Combo "${escolha.combo.nome}" (${resumirCombo(escolha.combo)})${concluiu ? ' — Combo concluído!' : '.'}`;
    } else if (escolha.tipo === 'avancar') {
        novo = avancarCombo(estado, escolha.combo);
        if (novo === estado) return ''; // escolha obsoleta (o Combo já foi interrompido ou concluído)
        const concluiu = !novo.ativo;
        texto = `🥋 ${escolha.golpe.nome || 'Golpe'} acertou no Combo "${escolha.combo.nome}" (golpe ${(estado.ativo ? estado.ativo.passo : 0) + 2}/${escolha.combo.passos.length + 1})${concluiu ? ' — Combo concluído, buffs no máximo!' : '.'}`;
    } else if (escolha.tipo === 'followUp') {
        novo = usarFollowUp(estado, escolha.followUp);
        const nivel = nivelDoFollowUp(escolha.followUp, novo);
        texto = `🥋 Follow Up "${escolha.followUp.nome}" (nível ${nivel + 1}) usado gastando ${rotuloAcaoGolpe(tipoCusto)}.`;
    } else {
        return '';
    }

    definirEstadoDeCombo(ficha, novo);
    if (gastar) gastarAcoes(ficha, [tipoCusto]);
    return texto;
}

// 🥋 Aceita uma OFERTA de Follow Up (gatilho `oferecerFollowUp`, core/ofertaFollowUp.js) no rascunho: registra o uso do Follow Up (como a escolha manual),
// tira a oferta, guarda o custo reduzido do próximo golpe (se a oferta tem) e marca "não gera outro" (se tem). Devolve o texto do feed ('' se a oferta já não vale).
export function aceitarOfertaFollowUp(ficha, ofertaId, { custo, gastar = true, agora = Date.now() } = {}) {
    const oferta = ofertasValidas(ficha, agora).find(o => o.id === ofertaId);
    if (!oferta) { removerOfertaFollowUp(ficha, ofertaId); return ''; }
    const fu = localizarFollowUp(ficha, oferta.followUpId);
    removerOfertaFollowUp(ficha, ofertaId);
    if (!fu) return '';
    let texto = aplicarEscolhaCombo(ficha, { tipo: 'followUp', followUp: fu, golpe: fu, custo }, { gastar });
    if (oferta.custoReducaoPct) {
        definirReducaoCusto(ficha, oferta.custoReducaoPct, agora);
        texto += ` O custo de energia do próximo golpe cai ${oferta.custoReducaoPct >= 100 ? '100% (sem custo)' : `${oferta.custoReducaoPct}%`}.`;
    }
    if (oferta.naoGeraOutro) marcarSemEncadeio(ficha, agora);
    return texto;
}

// Rótulos de Ação que faltam para pagar o custo (para avisar antes de confirmar).
export function acaoFaltando(ficha, tipoCusto) {
    return acoesEmFalta(ficha, [tipoCusto]);
}
