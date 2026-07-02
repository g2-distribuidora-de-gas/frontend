export interface EstadoPedido {
  id: string; 
  nombre: string;
}

export interface Pedido {
  id?: number;
  created_at: string;
  id_cliente: number;
  estado_id: string; 
  total: number;
  observaciones: string;
}

export interface DetallePedido {
  id?: number;
  created_at: string;
  id_pedido: number;
  id_producto: number;
  cantidad: number;
  precio_unitario: number;
  subtotal: number;
}

export interface PedidoCompleto extends Pedido {
  cliente?: import('./cliente.model').Cliente;
  estado?: EstadoPedido;
  detalles: (DetallePedido & { producto?: import('./producto.model').Producto })[];
}
