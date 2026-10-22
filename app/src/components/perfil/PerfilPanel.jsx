import React from 'react';
import { PerfilFormProvider } from './PerfilFormContext';
import { PerfilJogadorEditor, PerfilPersonagensSalvos, PerfilMestreToggle } from './PerfilSubComponents';
import AparenciaPanel from './AparenciaPanel';

export default function PerfilPanel({ className, children }) {
    const hasChildren = React.Children.count(children) > 0
    return (
        <PerfilFormProvider>
            <div className={['perfil-panel', className].filter(Boolean).join(' ')}>
                {hasChildren ? children : (
                    <>
                        <PerfilJogadorEditor />
                        <PerfilPersonagensSalvos />
                        <AparenciaPanel />
                        <PerfilMestreToggle />
                    </>
                )}
            </div>
        </PerfilFormProvider>
    );
}