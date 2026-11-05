module sync_fifo_tb;
  reg clk = 0;
  reg rst = 1;
  reg wr_en = 0;
  reg rd_en = 0;
  reg [7:0] din = 0;
  wire [7:0] dout;
  wire full;
  wire empty;

  sync_fifo dut (.clk(clk), .rst(rst), .wr_en(wr_en), .rd_en(rd_en), .din(din), .dout(dout), .full(full), .empty(empty));
  always #5 clk = ~clk;

  task automatic write_byte(input [7:0] value);
    begin
      @(negedge clk); wr_en = 1; din = value;
      @(negedge clk); wr_en = 0;
    end
  endtask

  task automatic read_byte(output [7:0] value);
    begin
      @(negedge clk); rd_en = 1;
      @(negedge clk); value = dout;
      rd_en = 0;
    end
  endtask

  initial begin
    repeat (2) @(negedge clk);
    rst = 0;
    if (!empty || full) $fatal(1, "reset flags wrong");
    for (int i = 0; i < 8; i = i + 1) write_byte(i[7:0]);
    if (!full) $fatal(1, "full did not assert at DEPTH");
    write_byte(8'hff);
    if (!full) $fatal(1, "full dropped while over capacity");
    for (int i = 0; i < 8; i = i + 1) begin
      logic [7:0] got;
      read_byte(got);
      if (got !== i[7:0]) $fatal(1, "data mismatch at %0d: got %0d", i, got);
    end
    if (!empty || full) $fatal(1, "empty did not assert after drain");
    $display("FIFO FUNCTIONAL PASS");
    $finish;
  end
endmodule
