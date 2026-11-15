import React, { useMemo, useState } from 'react';
import useStore from '../../stores/useStore';
import { getRacas, resolverRaca } from '../../core/racas';

// 🧬 Campo "Raça" das fichas (Ficha e Narrativa). Com catálogo de Raças na mesa (core/racas.js): seleção do catálogo + "Outra (texto livre)";
// sem catálogo: o mesmo campo de texto livre de sempre. O valor continua sendo o NOME da raça (ficha.bio.raca); o racaId é derivado ao salvar.
// Texto que não casa com nenhuma raça (nome ou apelido) é "Raça não cadastrada": sem acesso a Habilidades de Raça (não remove nada que já existe).
const VALOR_OUTRA = '__outra__';

export default function SeletorRaca({ valor, aoMudar, rotulo = 'Raça', desabilitado = false }) {
    const cenario = useStore(s => s.cenario);
    const racas = useMemo(() => getRacas(cenario), [cenario]);
    const [livre, setLivre] = useState(false);
    const texto = valor == null ? '' : String(valor);
    const casada = useMemo(() => resolverRaca(cenario, { bio: { raca: texto } }), [cenario, texto]);

    const rotuloEl = <label className="racas-seletor-rotulo">{rotulo}</label>;
    if (racas.length === 0) {
        return (
            <div>{rotuloEl}<input className="input-neon" type="text" value={texto} aria-label={rotulo} disabled={desabilitado} onChange={e => aoMudar(e.target.value)} /></div>
        );
    }
    const modoLivre = livre || (!casada.cadastrada && texto.trim() !== '');
    const selecionado = modoLivre ? VALOR_OUTRA : (casada.cadastrada ? casada.id : '');
    const escolher = (e) => {
        const v = e.target.value;
        if (v === VALOR_OUTRA) { setLivre(true); return; }
        setLivre(false);
        const raca = racas.find(r => r.id === v);
        aoMudar(raca ? raca.nome : '');
    };
    return (
        <div className="racas-seletor">
            {rotuloEl}
            <select className="input-neon" value={selecionado} aria-label={rotulo} disabled={desabilitado} onChange={escolher}>
                <option value="">Sem raça</option>
                {racas.map(r => <option key={r.id} value={r.id}>{r.icone} {r.nome}</option>)}
                <option value={VALOR_OUTRA}>Outra (texto livre)</option>
            </select>
            {modoLivre && (
                <>
                    <input className="input-neon racas-seletor-livre" type="text" value={texto} aria-label={`${rotulo} (texto livre)`} placeholder="Digite a raça" disabled={desabilitado}
                        onChange={e => { const t = e.target.value; aoMudar(t); }} />
                    <p className="racas-nao-cadastrada" role="note">
                        {resolverRaca(cenario, { bio: { raca: texto } }).cadastrada ? 'Esta raça está cadastrada: escolha-a na lista.' : '⚠️ Raça não cadastrada — sem acesso a Habilidades de Raça'}
                    </p>
                </>
            )}
        </div>
    );
}
