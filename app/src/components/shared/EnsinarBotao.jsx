import React, { useState, useMemo, useCallback } from 'react';
import useStore, { sanitizarNome } from '../../stores/useStore';
import { useFichaAtiva } from '../Ficha Def/FichaAlvoContext';
import { alunosPossiveis } from '../../core/ensinar';
import { enviarEnsinamento } from '../../services/ensinar';
import { poderEhCopiavel, mensagemCategoriaNaoLiberada, MENSAGEM_SINGULARIDADE_NAO_COPIA } from '../../core/categoriasPoder';

// 🎓 Botão "Ensinar" de uma Habilidade/Forma/Poder/Técnica: escolhe os alunos e o nível de aprendizado, e envia a oferta.
export default function EnsinarBotao({ tipo, item }) {
    const { nome: meuNome, souEuMesmo } = useFichaAtiva();
    const personagens = useStore(s => s.personagens);
    const adicionarAviso = useStore(s => s.adicionarAviso);
    const [aberto, setAberto] = useState(false);
    const [escolhidos, setEscolhidos] = useState([]);
    const [nivel, setNivel] = useState(50);
    const [enviando, setEnviando] = useState(false);
    const alunos = useMemo(() => alunosPossiveis(personagens, sanitizarNome(meuNome || '')), [personagens, meuNome]);

    // Aviso (não bloqueia): alunos escolhidos que ainda não têm a categoria deste poder liberada pelo Mestre.
    const semLiberacao = useMemo(() => {
        if (tipo !== 'poder') return [];
        return escolhidos.filter(n => mensagemCategoriaNaoLiberada(item, personagens?.[n]));
    }, [tipo, item, escolhidos, personagens]);

    const alternar = useCallback((nome) => {
        setEscolhidos(l => (l.includes(nome) ? l.filter(n => n !== nome) : [...l, nome]));
    }, []);

    const enviar = useCallback(async () => {
        setEnviando(true);
        try {
            const r = await enviarEnsinamento({ professor: meuNome, tipo, item, nivel, alunos: escolhidos });
            if (r.ok) {
                adicionarAviso(`Oferta de "${item.nome}" enviada. O aluno decide se aceita.`, 'info');
                setAberto(false);
                setEscolhidos([]);
            } else {
                adicionarAviso(r.erro, 'alerta');
            }
        } finally {
            setEnviando(false);
        }
    }, [meuNome, tipo, item, nivel, escolhidos, adicionarAviso]);

    if (!souEuMesmo) return null;
    // Singularidade é impossível de ensinar/copiar: o botão fica travado, com o motivo.
    if (tipo === 'poder' && !poderEhCopiavel(item)) {
        return (
            <div className="ensinar">
                <button type="button" className="btn-neon btn-small" disabled title={MENSAGEM_SINGULARIDADE_NAO_COPIA} aria-label={`Ensinar indisponível: ${MENSAGEM_SINGULARIDADE_NAO_COPIA}`}>🚫 Ensinar</button>
                <p className="ensinar-dica">{MENSAGEM_SINGULARIDADE_NAO_COPIA}</p>
            </div>
        );
    }
    return (
        <div className="ensinar">
            <button type="button" className="btn-neon btn-small" onClick={() => setAberto(a => !a)} title="Oferecer este conhecimento a outro personagem">🎓 Ensinar</button>
            {aberto && (
                <div className="ensinar-caixa fade-in">
                    {alunos.length === 0 && <p className="ensinar-dica">Não há outros personagens na mesa.</p>}
                    <div className="ensinar-alunos">
                        {alunos.map(nome => (
                            <label key={nome} className="ensinar-aluno">
                                <input type="checkbox" checked={escolhidos.includes(nome)} onChange={() => alternar(nome)} /> {nome}
                            </label>
                        ))}
                    </div>
                    <label className="ensinar-nivel">
                        Nível de aprendizado: <strong>{nivel}%</strong>
                        <input type="range" min="0" max="100" step="5" value={nivel} onChange={e => setNivel(Number(e.target.value))} aria-label="Nível de aprendizado" />
                    </label>
                    <p className="ensinar-dica">{tipo === 'poder' ? 'Vira a Maestria inicial do aluno: quanto menor, mais ele ainda precisa treinar.' : 'O aluno recebe uma cópia, anotada com este nível.'} Ele só recebe se aceitar.</p>
                    {semLiberacao.length > 0 && <p className="ensinar-dica">Atenção: {semLiberacao.join(', ')} ainda não {semLiberacao.length > 1 ? 'têm' : 'tem'} esta categoria liberada pelo Mestre (Ficha &gt; pág. 4, Marcados). A oferta fica pendente até a liberação.</p>}
                    <button type="button" className="btn-neon btn-gold btn-small" onClick={enviar} disabled={enviando || escolhidos.length === 0}>Enviar oferta</button>
                </div>
            )}
        </div>
    );
}
