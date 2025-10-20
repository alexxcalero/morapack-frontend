import axios from "axios";

const baseApi = axios.create({
	// URL para pruebas locales
	baseURL: "http://localhost:3000/api"
})

export default baseApi;
