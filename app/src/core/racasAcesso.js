// Decisão de acesso a Habilidade de Raça. Fica fora de core/racas.js para não criar ciclo com core/racasVisibilidade.js
// (racasVisibilidade importa racas; este módulo importa os dois).
import { ehHabilidadeDeRaca, racaTemAcessoPelaRaca, racaTemAcesso } from './racas';
import { motivoSemAcessoVisivel } from './racasVisibilidade';

// Decisão ÚNICA do acesso (aceitar ensinamento/cópia, importar, Sexta-Feira, modelo, salvar):
//  permitido: pode gravar agora; precisaConfirmarExcecao: só o Mestre, depois de confirmar "Raça sem acesso: conceder como exceção?" (gravar com racaExcecao: true).
//  Poder que não é Habilidade de Raça, que já tem exceção (racaExcecao === true) ou com acesso: permitido.
export function verificarAcessoHabilidadeRaca({ cenario, ficha, poder, isMestre } = {}) {
    if (!ehHabilidadeDeRaca(poder) || poder.racaExcecao === true || racaTemAcessoPelaRaca(cenario, ficha, poder)) {
        // Tem a Raça mas o percentual está abaixo do mínimo: pode receber a habilidade; ela fica 🔒 Domínio insuficiente até o percentual subir (poderBloqueado).
        if (ehHabilidadeDeRaca(poder) && poder.racaExcecao !== true && !racaTemAcesso(cenario, ficha, poder)) {
            return { permitido: true, precisaConfirmarExcecao: false, dominioInsuficiente: true, mensagem: '' };
        }
        return { permitido: true, precisaConfirmarExcecao: false, mensagem: '' };
    }
    // Raça oculta (core/racasVisibilidade.js): quem age é o dono da ficha (ou o Mestre, que vê tudo). Mensagem genérica só se citar/depender de Raça que ele não vê.
    const motivo = motivoSemAcessoVisivel(cenario, ficha, poder, { souDono: true, souMestre: isMestre === true });
    if (isMestre === true) {
        return { permitido: false, precisaConfirmarExcecao: true, mensagem: `${motivo}\n\nRaça sem acesso: conceder como exceção?` };
    }
    return { permitido: false, precisaConfirmarExcecao: false, mensagem: `${motivo} Só o Mestre pode conceder como exceção.` };
}
