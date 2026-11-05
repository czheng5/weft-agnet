module cdc_sync (
  input  wire clk,
  input  wire async_in,
  output wire sync_out
);
  reg meta;

  always @(posedge clk) begin
    meta <= async_in;
  end

  assign sync_out = meta;
endmodule
