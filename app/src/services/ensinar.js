// 🎓 Envio de ensinamentos: grava a oferta SÓ no campo ensinamentos/<id> da ficha do aluno (nunca a ficha inteira) e avisa no Feed.
import { salvarCamposPersonagem, enviarParaFeed } from './firebase-sync';
import { montarOferta } from '../core/ensinar';

// Devolve { ok, erro? }. `ctx` = { professor, tipo, item, nivel, alunos: [nomes] }.
export async function enviarEnsinamento({ professor, tipo, item, nivel, alunos }) {
    if (!Array.isArray(alunos) || alunos.length === 0) return { ok: false, erro: 'Escolha pelo menos um aluno.' };
    const falhas = [];
    let enviados = 0;
    for (const aluno of alunos) {
        const m = montarOferta({ professor, tipo, item, nivel });
        if (!m.ok) return { ok: false, erro: m.erro };
        const gravou = await salvarCamposPersonagem(aluno, { [`ensinamentos/${m.id}`]: m.oferta });
        if (gravou) enviados++; else falhas.push(aluno);
    }
    if (enviados > 0) {
        enviarParaFeed({ tipo: 'sistema', nome: professor, texto: `🎓 ${professor} se oferece para ensinar "${item.nome}" (nível ${Math.min(100, Math.max(0, Math.round(Number(nivel) || 0)))}%) a ${alunos.filter(a => !falhas.includes(a)).join(', ')}.` });
    }
    if (falhas.length > 0) return { ok: false, erro: `Não consegui enviar para ${falhas.join(', ')} (sem conexão ou o servidor recusou: confira as regras do Firebase para personagens).`, enviados };
    return { ok: true, enviados };
}
