// app/page.js
'use client';

import React from 'react';
import Image from 'next/image';
import Cabecera from './components/Cabecera/Cabecera';
import { Box, Button, Typography, Grid, Paper } from '@mui/material';
import Link from 'next/link';

export default function Home() {
  return (
    <>
      <main>
        <Box
          sx={{
            minHeight: 'calc(100vh - 64px)', // resto de la pantalla bajo la AppBar
            display: 'flex',
            alignItems: 'stretch',
          }}
        >
          {/* Lado izquierdo: imagen grande */}
          <Box
            sx={{
              flex: 1,
              position: 'relative',
            }}
          >
            {/* Coloca aquí tu imagen (por ejemplo /images/morapack-plane.jpg) */}
            <Image
              src="/images/morapack-plane.jpg"
              alt="Avión de carga MoraPack"
              fill
              priority
              style={{ objectFit: 'cover' }}
            />
          </Box>

          {/* Lado derecho: bienvenida + botones */}
          <Box
            sx={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              bgcolor: '#e0f2f9', // fondo celeste suave
              p: 4,
            }}
          >
            <Paper
              elevation={3}
              sx={{
                p: 4,
                maxWidth: 520,
                width: '100%',
                backgroundColor: 'rgba(255,255,255,0.92)',
                borderRadius: 3,
              }}
            >
              <Typography
                variant="h4"
                sx={{
                  mb: 2,
                  fontFamily: 'Jockey One, sans-serif',
                  textAlign: 'center',
                }}
              >
                Bienvenido al sistema de simulación de vuelos MoraPack
              </Typography>

              <Typography
                variant="body1"
                sx={{
                  mb: 4,
                  textAlign: 'center',
                  opacity: 0.8,
                }}
              >
                Explora los diferentes escenarios de operación y analiza el
                desempeño de tu red logística aérea.
              </Typography>

              <Grid container spacing={2} direction="column">
                <Grid item xs={12}>
                  <Link href="/simulacion-dia">
                    <Button
                      fullWidth
                      variant="contained"
                      color="primary"
                      sx={{ textTransform: "none", py: 1.5 }}
                    >
                      Monitoreo en tiempo real
                    </Button>
                  </Link>
                </Grid>

                <Grid item xs={12}>
                  <Link href="/simulacion-semanal">
                    <Button
                      fullWidth
                      variant="contained"
                      color="primary"
                      sx={{ textTransform: "none", py: 1.5 }}
                    >
                      Simulación semanal
                    </Button>
                  </Link>
                </Grid>

                <Grid item xs={12}>
                  <Link href="/simulacion-colapso">
                    <Button
                      fullWidth
                      variant="contained"
                      color="primary"
                      sx={{ textTransform: "none", py: 1.5 }}
                    >
                      Simulación de colapso
                    </Button>
                  </Link>
                </Grid>
              </Grid>
            </Paper>
          </Box>
        </Box>
      </main>
    </>
  );
}
