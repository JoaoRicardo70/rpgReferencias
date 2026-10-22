import { useEffect, useRef } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { salvarFichaSilencioso } from '../../services/firebase-sync';
import { novoPicoFuria } from '../../core/furia';

// ⚙️ Efeitos que precisam rodar o tempo todo, em qualquer aba (as abas fora da tela são desmontadas pra navegação ficar leve):
//  - Fúria Berserker: o pico de Vida perdida (ficha.combate.furiaMax) acompanha a Vida mesmo com a aba Ataque fechada;
//  - Aviso da decisão do Mestre: "O Mestre aprovou/recusou seu pedido" (Sexta-Feira) aparece onde quer que você esteja.
export default function EfeitosDeFundo() {
    const minhaFicha = useStore(s => s.minhaFicha);
    const updateFicha = useStore(s => s.updateFicha);
    const meuNome = useStore(s => s.meuNome);
    const sextaFeiraDecisoes = useStore(s => s.sextaFeiraDecisoes);
    const adicionarAviso = useStore(s => s.adicionarAviso);

    useEffect(() => {
        const pico = novoPicoFuria(minhaFicha);
        if (pico === null) return;
        updateFicha(f => { if (!f.combate) f.combate = {}; f.combate.furiaMax = pico; });
        salvarFichaSilencioso();
    }, [minhaFicha, updateFicha]);

    // Só decisões NOVAS (de depois de o app abrir) e do próprio jogador.
    const montadoEmRef = useRef(Date.now());
    const decisoesVistasRef = useRef(new Set());
    useEffect(() => {
        Object.entries(sextaFeiraDecisoes || {}).forEach(([id, d]) => {
            if (!d || decisoesVistasRef.current.has(id)) return;
            decisoesVistasRef.current.add(id);
            if (Number(d.em) < montadoEmRef.current || sanitizarNome(d.solicitante || '') !== sanitizarNome(meuNome || '')) return;
            adicionarAviso(d.aprovado ? `✅ O Mestre aprovou "${d.nomeCriacao}". Já está na sua ficha.` : `❌ O Mestre recusou "${d.nomeCriacao}".`, d.aprovado ? 'info' : 'alerta');
        });
    }, [sextaFeiraDecisoes, meuNome, adicionarAviso]);

    return null;
}
