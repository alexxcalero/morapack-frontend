"use client";

import React from "react";
import PropTypes from "prop-types";
import { alpha } from "@mui/material/styles";
import Box from "@mui/material/Box";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import Toolbar from "@mui/material/Toolbar";
import Typography from "@mui/material/Typography";
import Paper from "@mui/material/Paper";
import Checkbox from "@mui/material/Checkbox";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import FormControlLabel from "@mui/material/FormControlLabel";
import Switch from "@mui/material/Switch";
import DeleteIcon from "@mui/icons-material/Delete";
import EditIcon from "@mui/icons-material/Edit";
import FilterListIcon from "@mui/icons-material/FilterList";
import CloudUploadIcon from "@mui/icons-material/CloudUpload";
import RefreshIcon from "@mui/icons-material/Refresh";
import Chip from "@mui/material/Chip";
import { visuallyHidden } from "@mui/utils";
import { useRouter } from "next/navigation";

function descendingComparator(a, b, orderBy) {
  const va = a[orderBy];
  const vb = b[orderBy];

  if (typeof va === "number" && typeof vb === "number") {
    if (vb < va) return -1;
    if (vb > va) return 1;
    return 0;
  }

  if (typeof va === "string" && typeof vb === "string") {
    return vb.localeCompare(va, undefined, { sensitivity: "base" });
  }

  if (vb < va) return -1;
  if (vb > va) return 1;
  return 0;
}

function getComparator(order, orderBy) {
  return order === "desc"
    ? (a, b) => descendingComparator(a, b, orderBy)
    : (a, b) => -descendingComparator(a, b, orderBy);
}

const headCells = [
  { id: "id", numeric: true, disablePadding: true, label: "ID" },
  { id: "pais", numeric: false, disablePadding: false, label: "País" },
  { id: "codigo", numeric: false, disablePadding: false, label: "Código" },
  { id: "ciudad", numeric: false, disablePadding: false, label: "Ciudad" },
  { id: "abreviatura", numeric: false, disablePadding: false, label: "Abrev." },
  { id: "husoHorario", numeric: false, disablePadding: false, label: "Huso" },
  { id: "capacidadMaxima", numeric: true, disablePadding: false, label: "Cap. Máx." },
  { id: "capacidadOcupada", numeric: true, disablePadding: false, label: "Ocupada" },
  { id: "estado", numeric: false, disablePadding: false, label: "Estado" },
  { id: "coordenadas", numeric: false, disablePadding: false, label: "Coordenadas", hideOnXs: true },
  { id: "acciones", numeric: false, disablePadding: false, label: "Acciones", disableSort: true },
];

function EnhancedTableHead(props) {
  const { onSelectAllClick, order, orderBy, numSelected, rowCount, onRequestSort } = props;
  const createSortHandler = (property) => (event) => onRequestSort(event, property);

  return (
    <TableHead>
      <TableRow>
        <TableCell padding="checkbox">
          <Checkbox
            color="primary"
            indeterminate={numSelected > 0 && numSelected < rowCount}
            checked={rowCount > 0 && numSelected === rowCount}
            onChange={onSelectAllClick}
            inputProps={{ "aria-label": "seleccionar todos los aeropuertos" }}
          />
        </TableCell>

        {headCells.map((headCell) => (
          <TableCell
            key={headCell.id}
            align={headCell.numeric ? "right" : "left"}
            padding={headCell.disablePadding ? "none" : "normal"}
            sortDirection={orderBy === headCell.id && !headCell.disableSort ? order : false}
            sx={{ fontWeight: 600 }}
            style={headCell.hideOnXs ? {} : {}}
          >
            {headCell.disableSort ? (
              headCell.label
            ) : (
              <TableSortLabel
                active={orderBy === headCell.id}
                direction={orderBy === headCell.id ? order : "asc"}
                onClick={createSortHandler(headCell.id)}
              >
                {headCell.label}
                {orderBy === headCell.id ? (
                  <Box component="span" sx={visuallyHidden}>
                    {order === "desc" ? "ordenado descendente" : "ordenado ascendente"}
                  </Box>
                ) : null}
              </TableSortLabel>
            )}
          </TableCell>
        ))}
      </TableRow>
    </TableHead>
  );
}

EnhancedTableHead.propTypes = {
  numSelected: PropTypes.number.isRequired,
  onRequestSort: PropTypes.func.isRequired,
  onSelectAllClick: PropTypes.func.isRequired,
  order: PropTypes.oneOf(["asc", "desc"]).isRequired,
  orderBy: PropTypes.string.isRequired,
  rowCount: PropTypes.number.isRequired,
};

function EnhancedTableToolbar({ numSelected, onFilesSelected, onRefresh }) {
  return (
    <Toolbar
      sx={[
        { pl: { sm: 2 }, pr: { xs: 1, sm: 1 } },
        numSelected > 0 && { bgcolor: (theme) => alpha(theme.palette.primary.main, theme.palette.action.activatedOpacity) },
      ]}
    >
      {numSelected > 0 ? (
        <Typography sx={{ flex: "1 1 100%" }} color="inherit" variant="subtitle1" component="div">
          {numSelected} seleccionado(s)
        </Typography>
      ) : (
        <Typography sx={{ flex: "1 1 100%" }} variant="h6" id="tableTitle" component="div">
          Aeropuertos
        </Typography>
      )}

      <Tooltip title="Refrescar">
        <IconButton onClick={onRefresh}><RefreshIcon /></IconButton>
      </Tooltip>

      {numSelected > 0 ? (
        <Tooltip title="Eliminar selección">
          <IconButton><DeleteIcon /></IconButton>
        </Tooltip>
      ) : (
        <>
          <Tooltip title="Filtrar lista">
            <IconButton><FilterListIcon /></IconButton>
          </Tooltip>

          {/*<Tooltip title="Cargar archivo">
            <IconButton component="label">
              <input
                hidden
                accept=".csv,application/vnd.ms-excel,text/csv"
                type="file"
                onChange={(e) => {
                  const files = e.target.files;
                  if (!files || files.length === 0) return;
                  if (typeof onFilesSelected === "function") onFilesSelected(files);
                  e.target.value = null;
                }}
                aria-label="subir archivo de aeropuertos"
              />
              <CloudUploadIcon />
            </IconButton>
          </Tooltip>*/}
        </>
      )}
    </Toolbar>
  );
}

EnhancedTableToolbar.propTypes = {
  numSelected: PropTypes.number.isRequired,
  onFilesSelected: PropTypes.func,
  onRefresh: PropTypes.func,
};

export default function TablaAeropuertos({ initialRows = [] }) {
  const router = useRouter();
  const [rows, setRows] = React.useState(initialRows);
  React.useEffect(() => setRows(initialRows), [initialRows]); // actualizar si cambia la prop

  const [order, setOrder] = React.useState("asc");
  const [orderBy, setOrderBy] = React.useState("pais");
  const [selected, setSelected] = React.useState([]);
  const [page, setPage] = React.useState(0);
  const [dense, setDense] = React.useState(false);
  const [rowsPerPage, setRowsPerPage] = React.useState(10);

  const handleRequestSort = (event, property) => {
    if (property === "acciones") return;
    const isAsc = orderBy === property && order === "asc";
    setOrder(isAsc ? "desc" : "asc");
    setOrderBy(property);
  };

  const handleSelectAllClick = (event) => {
    if (event.target.checked) {
      const newSelected = rows.map((n) => n.id);
      setSelected(newSelected);
      return;
    }
    setSelected([]);
  };

  const handleClick = (event, id) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected = [];

    if (selectedIndex === -1) newSelected = newSelected.concat(selected, id);
    else if (selectedIndex === 0) newSelected = newSelected.concat(selected.slice(1));
    else if (selectedIndex === selected.length - 1) newSelected = newSelected.concat(selected.slice(0, -1));
    else if (selectedIndex > 0) newSelected = newSelected.concat(selected.slice(0, selectedIndex), selected.slice(selectedIndex + 1));

    setSelected(newSelected);
  };

  {/*const handleEditRow = (id) => {
    console.log("Editar", id);
  };*/}

  const handleDeleteRow = (id) => {
    if (!confirm(`Eliminar aeropuerto id ${id}?`)) return;
    console.log("Eliminar", id);
  };

  const handleChangePage = (event, newPage) => setPage(newPage);
  const handleChangeRowsPerPage = (event) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };
  const handleChangeDense = (event) => setDense(event.target.checked);

  const emptyRows = page > 0 ? Math.max(0, (1 + page) * rowsPerPage - rows.length) : 0;

  const visibleRows = React.useMemo(
    () => [...rows].sort(getComparator(order, orderBy)).slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage),
    [rows, order, orderBy, page, rowsPerPage]
  );

  const isSelected = (id) => selected.indexOf(id) !== -1;

  const estadoToColor = (estado) => (estado === 1 ? "success" : "default");
  const formatCoords = (lat, lon) => `${lat ?? ""} ${lon ?? ""}`;

  const handleRefresh = () => {
    router.refresh();
  };

  return (
    <Box sx={{ width: "100%" }}>
      <Paper sx={{ width: "100%", mb: 2, height: "calc(100vh - 200px)", display: "flex", flexDirection: "column" }}>
        <EnhancedTableToolbar numSelected={selected.length} onFilesSelected={() => {}} onRefresh={handleRefresh} />

        <TableContainer sx={{ flex: "1 1 auto", maxHeight: "100%" }}>
          <Table stickyHeader aria-labelledby="tableTitle" size={dense ? "small" : "medium"} sx={{ minWidth: 900 }}>
            <EnhancedTableHead
              numSelected={selected.length}
              order={order}
              orderBy={orderBy}
              onSelectAllClick={handleSelectAllClick}
              onRequestSort={handleRequestSort}
              rowCount={rows.length}
            />

            <TableBody>
              {visibleRows.map((row, index) => {
                const isItemSelected = isSelected(row.id);
                const labelId = `enhanced-table-checkbox-${index}`;

                return (
                  <TableRow
                    hover
                    onClick={(event) => handleClick(event, row.id)}
                    role="checkbox"
                    aria-checked={isItemSelected}
                    tabIndex={-1}
                    key={row.id}
                    selected={isItemSelected}
                    sx={{ cursor: "pointer", height: dense ? 40 : 56 }}
                  >
                    <TableCell padding="checkbox">
                      <Checkbox color="primary" checked={isItemSelected} inputProps={{ "aria-labelledby": labelId }} />
                    </TableCell>

                    <TableCell component="th" id={labelId} scope="row" padding="none" align="right">
                      {row.id}
                    </TableCell>

                    <TableCell align="left">{row.pais}</TableCell>
                    <TableCell align="left">{row.codigo}</TableCell>
                    <TableCell align="left">{row.ciudad}</TableCell>
                    <TableCell align="left">{row.abreviatura}</TableCell>
                    <TableCell align="left">{row.husoHorario}</TableCell>

                    <TableCell align="right">{row.capacidadMaxima}</TableCell>
                    <TableCell align="right">{row.capacidadOcupada}</TableCell>

                    <TableCell align="center">
                      <Chip label={row.estado === 1 ? "Activo" : "Inactivo"} size="small" color={estadoToColor(row.estado)} />
                    </TableCell>

                    <TableCell align="left" sx={{ display: { xs: "none", sm: "table-cell" } }}>
                      {formatCoords(row.latitud, row.longitud)}
                    </TableCell>

                    <TableCell align="right">
                      {/*<Tooltip title="Editar">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleEditRow(row.id); }}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>*/}
                      <Tooltip title="Eliminar">
                        <IconButton size="small" onClick={(e) => { e.stopPropagation(); handleDeleteRow(row.id); }}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}

              {emptyRows > 0 && (
                <TableRow style={{ height: (dense ? 40 : 56) * emptyRows }}>
                  <TableCell colSpan={headCells.length + 1} />
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", px: 2 }}>
          <FormControlLabel control={<Switch checked={dense} onChange={handleChangeDense} />} label="Vista compacta" />
          <TablePagination
            rowsPerPageOptions={[5, 10, 20, 50]}
            component="div"
            count={rows.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            showFirstButton
            showLastButton
          />
        </Box>
      </Paper>
    </Box>
  );
}

TablaAeropuertos.propTypes = {
  initialRows: PropTypes.array,
};
