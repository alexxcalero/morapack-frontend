import React from 'react';
import Link from 'next/link';
import Button from '@mui/material/Button';
import '../components/Envios/RegistrarEnvio.css';
import './Menu.css';

export default function Menu() {
	return (
        <div>
            <header className="header-proyecto">
                <h1>MoraPack</h1>
                <img src="/icons/usuario-perfil.png" width="30" height="30" />
            </header>

            <div className="principal">
                <div className="welcome-message">Bienvenido al sistema de Simulacion MoraPack</div>

                <div className="container">
                    <div className="header">
                        <Link href='/simulacion'>
                            <Button className="seleccion" variant="contained">SIMULACION SEMANAL</Button>
                        </Link>
                        <Link href='/operacionesDiarias'>
                            <Button className="seleccion" variant="contained">OPERACIONES DIARIAS</Button>
                        </Link>
                        <Link href='/simColapso'>
                            <Button className="seleccion" variant="contained">SIMULACION AL COLAPSO</Button>
                        </Link>
                    </div>
                    <div className="options">
                        <Link href="/envios">
                            <Button className="option" variant="contained">ENVIOS HISTORICOS</Button>
                        </Link>
                        <Link href="/aeropuertos">
                            <Button className="option" variant="contained">AEROPUERTOS</Button>
                        </Link>
                        <Link href="/planes">
                            <Button className="option" variant="contained">PLANES DE VUELO</Button>
                        </Link>
                        <Button className="option" variant="contained">REPORTES Y GRAFICOS</Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
