import React from 'react';
import useStore from '../../stores/useStore';
import { deletarPersonagem } from '../../services/firebase-sync';

export default function ModalConfirm({ className }) {
    const personagemParaDeletar = useStore(s => s.personagemParaDeletar);
    const setPersonagemParaDeletar = useStore(s => s.setPersonagemParaDeletar);
    const meuNome = useStore(s => s.meuNome);
    const setMeuNome = useStore(s => s.setMeuNome);
    const resetFicha = useStore(s => s.resetFicha);

    if (!personagemParaDeletar) return null;

    function fecharModal() {
        setPersonagemParaDeletar('');
    }

    function confirmarDelecao() {
        deletarPersonagem(personagemParaDeletar);
        if (meuNome === personagemParaDeletar) {
            setMeuNome('Sem Nome');
            try { localStorage.setItem('rpg_nome', 'Sem Nome'); } catch (e) { /* sem localStorage */ }
            resetFicha();
        }
        fecharModal();
    }

    return (
        <div className={['modal-overlay', className].filter(Boolean).join(' ')} style={{ display: 'flex' }}>
            <div className="modal-box">
                <h2 className="modal-critical-title" style={{ color: '#ff003c' }}>
                    CONFIRMAR EXCLUSAO
                </h2>
                <p style={{ color: '#ccc', margin: '15px 0' }}>
                    Tem certeza que deseja apagar permanentemente o personagem{' '}
                    <strong style={{ color: '#ff003c' }}>{personagemParaDeletar}</strong>?
                </p>
                <p style={{ color: '#888', fontSize: '0.85em' }}>
                    Esta acao nao pode ser desfeita.
                </p>
                <div style={{ display: 'flex', gap: 10, marginTop: 20, justifyContent: 'center' }}>
                    <button className="btn-neon" onClick={fecharModal}>
                        Cancelar
                    </button>
                    <button className="btn-neon btn-red" onClick={confirmarDelecao}>
                        Confirmar Exclusao
                    </button>
                </div>
            </div>
        </div>
    );
}
