package com.example.ventaslobostore.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.example.ventaslobostore.databinding.ItemOrderBinding
import com.example.ventaslobostore.model.Order
import java.text.SimpleDateFormat
import java.util.*

class OrderAdapter(
    private var orders: List<Order>,
    private val onStatusClick: (Order) -> Unit,
    private val onDeleteClick: (Order) -> Unit
) : RecyclerView.Adapter<OrderAdapter.OrderViewHolder>() {

    class OrderViewHolder(val binding: ItemOrderBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): OrderViewHolder {
        val binding = ItemOrderBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return OrderViewHolder(binding)
    }

    override fun onBindViewHolder(holder: OrderViewHolder, position: Int) {
        val order = orders[position]
        holder.binding.tvOrderUser.text = order.username.uppercase()
        holder.binding.tvOrderPhone.text = "TEL: ${order.phone}"
        holder.binding.tvOrderProduct.text = "PROD: ${order.name}"
        holder.binding.tvOrderPrice.text = "Cant: ${order.quantity} | Total: $${order.totalPrice}"
        holder.binding.chipStatus.text = order.status
        
        val date = Date(order.timestamp)
        val format = SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.getDefault())
        holder.binding.tvOrderTime.text = format.format(date)

        Glide.with(holder.itemView.context)
            .load(order.imageUrl)
            .placeholder(android.R.drawable.ic_menu_gallery)
            .into(holder.binding.ivOrderImage)

        holder.binding.chipStatus.setOnClickListener { onStatusClick(order) }
        holder.binding.btnDeleteOrder.setOnClickListener { onDeleteClick(order) }
    }

    override fun getItemCount() = orders.size

    fun updateOrders(newOrders: List<Order>) {
        orders = newOrders
        notifyDataSetChanged()
    }
}
