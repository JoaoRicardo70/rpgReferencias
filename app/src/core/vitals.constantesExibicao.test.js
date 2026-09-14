import { describe, it, expect } from 'vitest';
import { LIMIAR_BARRA_VIDA, FATOR_EXIBICAO_VITAIS } from './vitals';

// ---------------------------------------------------------------------------
// QA — guardas de regressão baratas para as duas constantes centrais da
// reformulação de exibição de Vida/Mana/Aura/Chakra/Corpo:
//
// - LIMIAR_BARRA_VIDA: limiar BRUTO (sem o fator de exibição) que concede uma
//   nova "Break Bar" de Vida. Passou de 100.000.000 para 1.000.000.000
//   especificamente para que, após dividir por FATOR_EXIBICAO_VITAIS na
//   exibição, cada barra cheia mostre "1.000.000" ao jogador.
// - FATOR_EXIBICAO_VITAIS: divisor aplicado SÓ na camada de UI (nunca no
//   valor bruto salvo em ficha, nunca dentro de calcVitalScale/
//   calcularBarrasVida/getVitalMxDisplay/getTetoVida).
//
// Nenhum teste aqui exercita comportamento — só protege contra alguém
// reverter uma dessas constantes por engano numa refatoração futura.
// ---------------------------------------------------------------------------

describe('core/vitals.js — constantes da reformulação de exibição de Vitais', () => {
    it('LIMIAR_BARRA_VIDA é exatamente 1.000.000.000 (1 bilhão bruto por Break Bar)', () => {
        expect(LIMIAR_BARRA_VIDA).toBe(1000000000);
    });

    it('FATOR_EXIBICAO_VITAIS é exatamente 1000 (divisor de exibição/edição dos 5 Vitais)', () => {
        expect(FATOR_EXIBICAO_VITAIS).toBe(1000);
    });

    it('LIMIAR_BARRA_VIDA dividido por FATOR_EXIBICAO_VITAIS resulta em exatamente 1.000.000 (o "1 milhão" exibido por Break Bar cheia)', () => {
        expect(LIMIAR_BARRA_VIDA / FATOR_EXIBICAO_VITAIS).toBe(1000000);
    });
});
