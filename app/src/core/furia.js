// ==========================================
// 🔥 FÚRIA BERSERKER — lógica pura do "pico de Vida perdida" (ficha.combate.furiaMax).
// O pico precisa acompanhar a Vida o tempo todo, esteja a aba Ataque aberta ou não (EfeitosDeFundo.jsx).
// ==========================================
import { getEfeitosDeClasse } from './attributes';
import { getVidaTotalMaxDisplay } from './vitals';
import { escalarEfeitosPorEstagio } from './estagios';

// Maior valor de "furia_berserker" entre os efeitos que valem agora (Poderes ligados e passivos, itens equipados, passivas, Classe).
export function calcularMultiplicadorFuriaClasse(ficha) {
    let maxFuria = 0;
    const scanFuria = (efs) => {
        if (!efs) return;
        efs.forEach(e => {
            if (!e) return;
            const p = (e.propriedade || '').toLowerCase().trim().normalize('NFD').replace(/[̀-ͯ]/g, '');
            if (p === 'furia_berserker') {
                const v = parseFloat(e.valor) || 0;
                if (v > maxFuria) maxFuria = v;
            }
        });
    };
    if (ficha) {
        (ficha.poderes || []).forEach(p => { if (p && p.ativa) scanFuria(escalarEfeitosPorEstagio(p.efeitos, p)); scanFuria(p?.efeitosPassivos); });
        (ficha.inventario || []).forEach(i => { if (i && i.equipado) { scanFuria(i.efeitos); scanFuria(i.efeitosPassivos); } });
        (ficha.passivas || []).forEach(p => scanFuria(p.efeitos));
        scanFuria(getEfeitosDeClasse(ficha));
    }
    return maxFuria;
}

// % de Vida perdida (0-100, arredondado pra baixo), na escala exibida do total de Vida.
export function calcularPercVidaPerdida(ficha) {
    const maxVida = ficha ? getVidaTotalMaxDisplay(ficha) : 1;
    const atualVida = ficha?.vida?.atual ?? maxVida;
    return Math.floor(maxVida > 0 ? Math.max(0, ((maxVida - atualVida) / maxVida) * 100) : 0);
}

// Novo pico de Fúria, ou null se não há o que gravar.
export function novoPicoFuria(ficha) {
    if (!ficha) return null;
    const perc = calcularPercVidaPerdida(ficha);
    const atual = ficha.combate?.furiaMax || 0;
    return calcularMultiplicadorFuriaClasse(ficha) > 0 && perc > atual ? perc : null;
}
