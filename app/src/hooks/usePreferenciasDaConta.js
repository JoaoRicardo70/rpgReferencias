import { useEffect } from 'react';
import { lerPreferenciasDaConta, gravarPreferenciasDaConta } from '../services/preferencias-sync';
import { aplicarPreferenciasRemotas, coletarPreferencias, diferencaDePreferencias } from '../core/preferencias';

const INTERVALO_VERIFICACAO_MS = 5000; // confere se alguma preferência mudou (o localStorage não avisa mudanças da própria aba)
const CHAVE_RECARGA = 'rpg_prefs_recarregado';

// Leva as configurações (estilo, atalhos, volumes...) junto com a CONTA: ao entrar, o que está na conta vale; depois, cada
// mudança é gravada na conta (a verificação é periódica e só grava quando algo mudou, então não estoura a cota do Firebase).
export function usePreferenciasDaConta(meuNome) {
    useEffect(() => {
        if (!meuNome) return undefined;
        let cancelado = false;
        let timer = null;
        let ultimas = null; // última cópia conhecida da conta (a que gravamos ou lemos)
        let gravando = false;

        const gravarSeMudou = async () => {
            if (cancelado || gravando || ultimas === null) return;
            const atuais = coletarPreferencias();
            const { mudadas, removidas } = diferencaDePreferencias(ultimas, atuais);
            if (Object.keys(mudadas).length === 0 && removidas.length === 0) return;
            gravando = true;
            const ok = await gravarPreferenciasDaConta(meuNome, mudadas, removidas);
            gravando = false;
            if (ok && !cancelado) ultimas = atuais;
        };

        (async () => {
            const remotas = await lerPreferenciasDaConta(meuNome);
            if (cancelado || remotas === null) return; // sem acesso à conta: fica só com o aparelho
            const alteradas = aplicarPreferenciasRemotas(remotas);
            if (alteradas > 0) {
                // Estilo, zoom, atalhos etc. são lidos ao abrir: recarrega UMA vez para valerem já (a trava evita repetir se o navegador não gravar).
                let jaRecarregou = false;
                try { jaRecarregou = sessionStorage.getItem(CHAVE_RECARGA) === meuNome; sessionStorage.setItem(CHAVE_RECARGA, meuNome); } catch (e) { jaRecarregou = true; }
                if (!jaRecarregou && typeof window !== 'undefined' && window.location && typeof window.location.reload === 'function') { window.location.reload(); return; }
            }
            // A cópia conhecida é a da conta: o que só existe neste aparelho (ou conta ainda vazia) sobe na primeira verificação.
            ultimas = remotas;
            if (cancelado) return;
            timer = setInterval(gravarSeMudou, INTERVALO_VERIFICACAO_MS);
            gravarSeMudou();
        })();

        const aoSair = () => { gravarSeMudou(); };
        window.addEventListener('pagehide', aoSair);
        return () => {
            cancelado = true;
            if (timer) clearInterval(timer);
            window.removeEventListener('pagehide', aoSair);
        };
    }, [meuNome]);
}
